import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  Struct,
  UInt64,
  Bool,
  Poseidon,
  ZkProgram,
  Proof,
  TokenContract,
  AccountUpdateForest,
  Provable,
  AccountUpdate,
  Reducer
} from "o1js";

/**
 * Define the bid verification circuit.
 * It takes as public inputs:
 *   - encryptedBid: the commitment computed off-chain,
 *   - minBid: the minimum acceptable bid.
 * 
 * Its private inputs are:
 *   - bidAmount: the actual bid amount,
 *   - nonce: the secret used for the commitment.
 * 
 * The circuit asserts that:
 *   - Poseidon.hash([bidAmount, nonce]) equals encryptedBid,
 *   - bidAmount ≥ minBid.
 */

class PublicInputStruct extends Struct({
  encryptedBid: Field,
  minBid: UInt64
}) {}
/**
 * Define a custom subclass for proofs.
 * The base Proof class cannot be used directly.
 */
/* export class BidProof extends Proof<{ encryptedBid: Field; minBid: Field }, void> {
  constructor(
    data: {
      proof: any; // Replace 'any' with the proper Pickles.Proof type if available.
      publicInput: { encryptedBid: Field; minBid: Field };
      publicOutput: void;
      maxProofsVerified: 0 | 1 | 2;
    } = {
      proof: {} as any,
      publicInput: { encryptedBid: Field(0), minBid: Field(0) },
      publicOutput: undefined,
      maxProofsVerified: 0,
    }
  ) {
    super(data);
  }
  static empty(): BidProof {
    return new BidProof();
  }
} */

export class Bid extends Struct({
  bidder: PublicKey,
  bidAmount: UInt64,
  
}) {}

/**
 * AuctionState holds overall auction parameters.
 */
export class AuctionState extends Struct({
  endTime: UInt64,
  minBid: UInt64,
}) {}

const seller = "SELLER_ADDRESS"

/**
 * The PrivateAuctionContract groups auction info, highest bid, and (off-chain)
 * deposit mapping (here stored in a state for demonstration).
 */
export class PrivateAuctionContract extends TokenContract {

  reducer = Reducer({ actionType: Bid})

  @state(AuctionState) auctionInfo = State<AuctionState>();
  @state(Bid) highestBid = State<Bid>();
  @state(Field) actionState = State<Field>();

  private seller = PublicKey.empty();
  // Off-chain deposit mapping (for testing/demo)
  // deposits: Map<string, UInt64> = new Map();

  init() {
    super.init();
    this.auctionInfo.set(new AuctionState({
      endTime: UInt64.from(0),
      minBid: UInt64.from(0),
    }));
    this.highestBid.set(new Bid({
      bidder: PublicKey.empty(),
      bidAmount: UInt64.from(0)
    }));
    this.actionState.set(Reducer.initialActionState)
  }

  @method
  async approveBase(updates: AccountUpdateForest): Promise<void> {
      this.checkZeroBalanceChange(updates)
  }

  @method async initializeAuction(auctionDuration: UInt64, minBid: UInt64) {
    this.auctionInfo.set(new AuctionState({
      endTime: UInt64.from(this.network.timestamp.getAndRequireEquals()).add(auctionDuration),
      minBid: minBid,
    }));
  }

  /**
   * submitBidWithProof accepts:
   *  - an EncryptedBid (which includes the bidder’s encrypted bid and its proof),
   *  - a deposit (for fund management),
   *  - and a plain bid value (bidPlain) for state updates.
   *
   * It first checks that the auction is active, then verifies the zk proof
   * using our BidCircuit. If the proof verifies and bidPlain is higher than the current highest,
   * it updates the highest bid state.
   */
  @method async submitBidWithProof(bid: Bid, deposit: UInt64) {
    const auction = this.auctionInfo.getAndRequireEquals();
    const currentTime = UInt64.from(this.network.timestamp.getAndRequireEquals());
    auction.endTime.assertGreaterThan(currentTime);


    this.internal.mint({address: bid.bidder, amount: deposit})
    deposit.assertGreaterThanOrEqual(auction.minBid);
    this.send({ to: this.address, amount: deposit });
    this.reducer.dispatch(bid)
  }

  @method async revealWinningBid() {
    const auction = this.auctionInfo.getAndRequireEquals();
    const currentTime = UInt64.from(this.network.timestamp.getAndRequireEquals());
    auction.endTime.assertLessThan(currentTime);

    let pendingActions = this.reducer.getActions(
      {
        fromActionState: this.actionState.getAndRequireEquals(),
      }
    );
    
    let highestBid = this.reducer.reduce(
      pendingActions,
      Bid, 
      (state: Bid, action: Bid) => {
        return Provable.if(action.bidAmount.greaterThan(state.bidAmount), Bid, action, state )
      }, this.highestBid.getAndRequireEquals()
    );

    // Mettre à jour l'état avec le plus haut enchérisseur
    this.highestBid.set(highestBid);
  }

  @method async finalizeAuction() {
    
    const highestBid = this.highestBid.getAndRequireEquals();
    highestBid.bidder.isEmpty().assertFalse();

    // Transfer funds to the seller using the built-in send method.
    this.send({ to: this.seller, amount: highestBid.bidAmount });
  
    // Update deposits: set the winner's deposit to zero.
    this.internal.burn({address: highestBid.bidder, amount: highestBid.bidAmount})
  }

  @method async withdraw(bidder: PublicKey) {
    const highestBid = this.highestBid.getAndRequireEquals();
    highestBid.bidder.isEmpty().assertFalse();
    const account = AccountUpdate.create(bidder, this.deriveTokenId()).account
    const balance = account.balance.get()
    account.balance.requireEquals(balance)
    this.send({ to: bidder, amount: balance });
    this.internal.burn({address: bidder, amount: balance})
  }
}