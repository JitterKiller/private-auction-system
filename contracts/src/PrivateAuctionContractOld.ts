// import {
//     Field,
//     SmartContract,
//     state,
//     State,
//     method,
//     PublicKey,
//     Struct,
//     UInt64,
//     Bool,
//     Poseidon,
//     ZkProgram,
//     Proof
//   } from "o1js";
  
//   /**
//    * Define the bid verification circuit.
//    * It takes as public inputs:
//    *   - encryptedBid: the commitment computed off-chain,
//    *   - minBid: the minimum acceptable bid.
//    * 
//    * Its private inputs are:
//    *   - bidAmount: the actual bid amount,
//    *   - nonce: the secret used for the commitment.
//    * 
//    * The circuit asserts that:
//    *   - Poseidon.hash([bidAmount, nonce]) equals encryptedBid,
//    *   - bidAmount ≥ minBid.
//    */
  
//   class PublicInputStruct extends Struct({
//     encryptedBid: Field,
//     minBid: UInt64
//   }) {}
//   export const BidCircuit = ZkProgram({
//     name: "BidVerifier",
//     publicInput: PublicInputStruct,
//     methods: {
//       proveBid: {
//         privateInputs: [UInt64, Field], // bidAmount, nonce
//         async method(publicInput: PublicInputStruct, bidAmount: UInt64, nonce: Field) {
//           const computed = Poseidon.hash([bidAmount.value, nonce]);
//           computed.assertEquals(publicInput.encryptedBid);
//           bidAmount.assertGreaterThanOrEqual(publicInput.minBid);
//           return undefined;
//         }
//       }
//     }
//   });
//   export const BidProof = ZkProgram.Proof(BidCircuit);
//   class BidProofType extends BidProof {}
//   /**
//    * Define a custom subclass for proofs.
//    * The base Proof class cannot be used directly.
//    */
//   /* export class BidProof extends Proof<{ encryptedBid: Field; minBid: Field }, void> {
//     constructor(
//       data: {
//         proof: any; // Replace 'any' with the proper Pickles.Proof type if available.
//         publicInput: { encryptedBid: Field; minBid: Field };
//         publicOutput: void;
//         maxProofsVerified: 0 | 1 | 2;
//       } = {
//         proof: {} as any,
//         publicInput: { encryptedBid: Field(0), minBid: Field(0) },
//         publicOutput: undefined,
//         maxProofsVerified: 0,
//       }
//     ) {
//       super(data);
//     }
//     static empty(): BidProof {
//       return new BidProof();
//     }
//   } */
  
//   /**
//    * EncryptedBid now carries a BidProof instead of a raw Field.
//    */
//   export class EncryptedBid extends Struct({
//     bidder: PublicKey,
//     encryptedBid: Field,
//   }) {}
  
//   /**
//    * RevealBid remains unchanged.
//    */
//   export class RevealBid extends Struct({
//     bidder: PublicKey,
//     bidAmount: UInt64,
//     nonce: Field,
//     revealProof: Field
//   }) {}
  
//   /**
//    * AuctionState holds overall auction parameters.
//    */
//   export class AuctionState extends Struct({
//     seller: PublicKey,
//     endTime: UInt64,
//     minBid: UInt64,
//     isEnded: Bool
//   }) {}
  
//   /**
//    * HighestBidState stores the current highest bid.
//    */
//   export class HighestBidState extends Struct({
//     bidder: PublicKey,
//     encryptedBid: Field,
//     plainValue: Field
//   }) {}
  
//   /**
//    * The PrivateAuctionContract groups auction info, highest bid, and (off-chain)
//    * deposit mapping (here stored in a state for demonstration).
//    */
//   export class PrivateAuctionContract extends SmartContract {
//     @state(AuctionState) auctionInfo = State<AuctionState>();
//     @state(HighestBidState) highestBid = State<HighestBidState>();
//     @state(Field) depositsRoot = State<Field>(); // For a complete solution, use a Merkle tree
  
//     // Off-chain deposit mapping (for testing/demo)
//     deposits: Map<string, UInt64> = new Map();
  
//     init() {
//       super.init();
//       this.auctionInfo.set(new AuctionState({
//         seller: PublicKey.empty(),
//         endTime: UInt64.from(0),
//         minBid: UInt64.from(0),
//         isEnded: Bool(false)
//       }));
//       this.highestBid.set(new HighestBidState({
//         bidder: PublicKey.empty(),
//         encryptedBid: Field(0),
//         plainValue: Field(0)
//       }));
//       this.depositsRoot.set(Field(0));
//     }
  
//     @method async initializeAuction(seller: PublicKey, auctionDuration: UInt64, minBid: UInt64) {
//       const currentAuction = this.auctionInfo.get();
//       currentAuction.seller.assertEquals(PublicKey.empty());
//       this.auctionInfo.set(new AuctionState({
//         seller: seller,
//         endTime: UInt64.from(Date.now()).add(auctionDuration),
//         minBid: minBid,
//         isEnded: Bool(false)
//       }));
//     }
  
//     /**
//      * submitBidWithProof accepts:
//      *  - an EncryptedBid (which includes the bidder’s encrypted bid and its proof),
//      *  - a deposit (for fund management),
//      *  - and a plain bid value (bidPlain) for state updates.
//      *
//      * It first checks that the auction is active, then verifies the zk proof
//      * using our BidCircuit. If the proof verifies and bidPlain is higher than the current highest,
//      * it updates the highest bid state.
//      */
//     @method async submitBidWithProof(bid: EncryptedBid, deposit: UInt64, bidPlain: Field, proof: BidProofType) {
//       const auction = this.auctionInfo.get();
//       const currentTime = UInt64.from(Date.now());
//       auction.endTime.assertGreaterThan(currentTime);
//       auction.isEnded.assertEquals(Bool(false));
  
//       // Record the deposit (simulate deposit recording)
//       const bidderKey = bid.bidder.toBase58();
//       const existingDeposit = this.deposits.get(bidderKey) || UInt64.from(0);
//       this.deposits.set(bidderKey, existingDeposit.add(deposit));
  
//       proof.verify();
  
//       // Update highest bid if the new bid (bidPlain) is higher.
//       const currentHighest = this.highestBid.get().plainValue;
//       if (bidPlain.greaterThan(currentHighest).toBoolean()) {
//         this.highestBid.set(new HighestBidState({
//           bidder: bid.bidder,
//           encryptedBid: bid.encryptedBid,
//           plainValue: bidPlain
//         }));
//       }
//     }
  
//     @method async revealWinningBid(reveal: RevealBid) {
//       const auction = this.auctionInfo.get();
//       const currentTime = UInt64.from(Date.now());
//       auction.endTime.assertLessThan(currentTime);
//       auction.isEnded.assertEquals(Bool(false));
  
//       const sender = this.sender.getAndRequireSignature();
//       const highestBid = this.highestBid.get();
//       sender.assertEquals(highestBid.bidder);
  
//       const computedEncryptedBid = Poseidon.hash([reveal.bidAmount.toFields()[0], reveal.nonce]);
//       computedEncryptedBid.assertEquals(highestBid.encryptedBid);
//       reveal.revealProof.assertNotEquals(Field(0));
  
//       this.auctionInfo.set(new AuctionState({
//         ...auction,
//         isEnded: Bool(true)
//       }));
//     }
  
//     @method async finalizeAuction() {
//       const auction = this.auctionInfo.get();
//       const currentTime = UInt64.from(Date.now());
//       auction.endTime.assertLessThan(currentTime);
//       this.auctionInfo.set(new AuctionState({
//         ...auction,
//         isEnded: Bool(true)
//       }));
  
//       const highestBid = this.highestBid.get();
//       // Transfer funds to the seller using the built-in send method.
//       const winnerDeposit = this.deposits.get(highestBid.bidder.toBase58()) || UInt64.from(0);
//       this.send({ to: auction.seller, amount: winnerDeposit });
      
//       // Update deposits: set the winner's deposit to zero.
//       this.deposits.set(highestBid.bidder.toBase58(), UInt64.from(0));
//     }
  
//     @method async withdraw(bidder: PublicKey) {
//       const sender = this.sender.getAndRequireSignature();
//       sender.assertEquals(bidder);
//       const deposit = this.deposits.get(bidder.toBase58())?.or(UInt64.from(0));
//       this.send({ to: bidder, amount: deposit });
//       this.deposits.set(bidder.toBase58(), UInt64.from(0));
//     }
//   }