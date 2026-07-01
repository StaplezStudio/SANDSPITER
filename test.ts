import Irys from '@irys/sdk';
import { Wallet } from 'ethers';

async function test() {
  const wallet = Wallet.createRandom();
  try {
    const irys = new Irys({ url: 'https://node2.irys.xyz', token: 'ethereum', key: wallet.privateKey });
    const res = await irys.upload('test payload for free under 100kb');
    console.log('SUCCESS', res.id);
  } catch (e) {
    console.error('ERROR', e.message);
  }
}
test();
