# ChainQuest Submission

## Post-submission UI branch

After the official assessment submission, I continued the implementation on the `post-submission-ui` branch.

This branch includes:
- wallet-connected quest creation
- accept quest flow
- submit deliverable flow
- approve and payout flow
- completed quest state
- screenshots in `assets/`


Name: Dawid Bubernak  
Email: dawid.bubernak@gmail@gmail.com 
GitHub repo: (https://github.com/BuberDev/chainquest-home-task)

## Status

- Smart contract implementation completed.
- All assessment contract tests pass: 9/9.
- `QuestEscrow.sol` implements ETH and ERC20 escrow flows, 3% fee accounting, cancellation, poster refund, worker timeout payout, and owner fee withdrawal.
- UI wallet hook / full localhost UI flow was not completed within the time limit.

## How to run tests

```bash
npm install
npm install --prefix contracts
cd contracts
npx hardhat test