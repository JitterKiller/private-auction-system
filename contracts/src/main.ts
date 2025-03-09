import { PrivateAuctionContract, Bid} from './PrivateAuctionContract.js';
import { Field, Mina, PrivateKey, AccountUpdate, PublicKey, UInt64, Poseidon } from 'o1js';

const useProof = true;

const Local = await Mina.LocalBlockchain({ proofsEnabled: useProof });
Mina.setActiveInstance(Local);

let compiled = await PrivateAuctionContract.compile()

const deployerAccount = Local.testAccounts[0]; // vendeur
const deployerKey = deployerAccount.key;
const senderAccount = Local.testAccounts[1]; // premier enchérisseur
const senderKey = senderAccount.key;
const bidder2Account = Local.testAccounts[2]; // deuxième enchérisseur
const bidder2Key = bidder2Account.key;
// ----------------------------------------------------

console.log('Déploiement du contrat d\'enchère privée...');

// Création d'une paire de clés pour le contrat
const zkAppPrivateKey = PrivateKey.random();
const zkAppAddress = zkAppPrivateKey.toPublicKey();

// Création d'une instance du contrat et déploiement
const auction = new PrivateAuctionContract(zkAppAddress);
const deployTxn = await Mina.transaction(deployerAccount, async () => {
  AccountUpdate.fundNewAccount(deployerAccount);
  await auction.deploy();
});
await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();

console.log('Contrat déployé avec succès à l\'adresse:', zkAppAddress.toBase58());

// Test 1: Initialisation de l'enchère
console.log('\n--- Test 1: Initialisation de l\'enchère ---');
try {
  const initTxn = await Mina.transaction(deployerAccount, async () => {
    await auction.initializeAuction(
      UInt64.from(3600000),      // durée: 1 heure
      UInt64.from(100)           // enchère minimale: 100
    );
  });
  await initTxn.prove();
  await initTxn.sign([deployerKey]).send();
  console.log('✅ Enchère initialisée avec succès');
} catch (error: any) {
  console.log('❌ Échec de l\'initialisation de l\'enchère:', error.message);
}

// Test 2: Soumission d'une enchère
console.log('\n--- Test 2: Soumission d\'une enchère ---');
try {
  const bidAmount1 = UInt64.from(150);  
  const bid1 = new Bid({
    bidder: senderKey.toPublicKey(),
    bidAmount: bidAmount1,
  });
  
  const bidTxn = await Mina.transaction(senderAccount, async () => {
    AccountUpdate.fundNewAccount(senderAccount);
    await auction.submitBidWithProof(bid1, bidAmount1);
  });
  await bidTxn.prove();
  await bidTxn.sign([senderKey]).send();
  console.log('✅ Enchère soumise avec succès');
  
  // Vérification de l'état
  console.log('Meilleur enchérisseur:', auction.highestBid.get().bidder.toBase58());
  console.log('Valeur de la meilleure enchère:', auction.highestBid.get().bidAmount.toString());
} catch (error: any) {
  console.log('❌ Échec de la soumission de l\'enchère:', error.message);
}

// Test 3: Soumission d'une enchère plus élevée
console.log('\n--- Test 3: Soumission d\'une enchère plus élevée ---');
try {
  const bidAmount2 = UInt64.from(150);
  const bid2 = new Bid({
    bidder: bidder2Key.toPublicKey(),
    bidAmount: bidAmount2,
  });
  
  const bidTxn = await Mina.transaction(bidder2Account, async () => {
    AccountUpdate.fundNewAccount(bidder2Account);
    await auction.submitBidWithProof(bid2, bidAmount2);
  });
  await bidTxn.prove();
  await bidTxn.sign([bidder2Key]).send();
  console.log('✅ Deuxième enchère soumise avec succès');
  
  // Vérification de l'état
  console.log('Nouveau meilleur enchérisseur:', auction.highestBid.get().bidder.toBase58());
  console.log('Nouvelle valeur de la meilleure enchère:', auction.highestBid.get().bidAmount.toString());
} catch (error: any) {
  console.log('❌ Échec de la soumission de la deuxième enchère:', error.message);
}

console.log('\n--- Tests terminés ---');
