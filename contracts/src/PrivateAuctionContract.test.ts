import { Field, Poseidon, ZkProgram, Struct } from "o1js";

const BidCircuit = ZkProgram({
  name: "BidVerifier",
  publicInput: Struct({
    encryptedBid: Field,
    minBid: Field
  }),
  methods: {
    proveBid: {
      privateInputs: [Field, Field], // bidAmount, nonce
      async method(publicInput, bidAmount, nonce) {
        // Compute the hash using the bid amount and nonce.
        const computed = Poseidon.hash([bidAmount, nonce]);
        computed.assertEquals(publicInput.encryptedBid);
        // Check that bidAmount is greater than or equal to minBid.
        bidAmount.assertGreaterThanOrEqual(publicInput.minBid);
        return undefined;
      }
    }
  }
});

// Set up sample inputs.
const bidAmount = Field(150);
const nonce = Field(12345);
const minBid = Field(100);
const encryptedBid = Poseidon.hash([bidAmount, nonce]);

// Build the public inputs exactly as declared in the circuit.
const publicInputs = {
  encryptedBid: encryptedBid,
  minBid: minBid,
};

async function testProof() {
  console.log("Compiling circuit...");
  await BidCircuit.compile(); // Compile the circuit to cache the prover.
  
  console.log("Generating proof...");
  const proof = await BidCircuit.proveBid(publicInputs, bidAmount, nonce);
  
  console.log("Verifying proof...");
  const isValid = await BidCircuit.verify(proof.proof);
  
  console.log("Proof valid:", isValid);
}

testProof().catch((error) => {
  console.error("Error during testing:", error);
});
