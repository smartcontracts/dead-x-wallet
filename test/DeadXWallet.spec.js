/* External Imports */
const chai = require('chai')
const {
  createMockProvider,
  deployContract,
  getWallets,
  solidity,
} = require('ethereum-waffle')
const ethers = require('ethers')

/* Contracts */
const DeadXWallet = require('../build/DeadXWallet')

chai.use(solidity)
const expect = chai.expect;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DEFAULT_RECOVERY_BOND = ethers.utils.parseEther('1.0')
const DEFAULT_RECOVERY_TIMEOUT = 5760 * 30

describe('DeadXWallet', () => {
  const provider = createMockProvider()
  const [
    owner,
    beneficiary1,
    beneficiary2,
    attacker,
  ] = getWallets(provider)
  let contract;

  beforeEach(async () => {
    contract = await deployContract(owner, DeadXWallet)
  })

  describe('constructor', () => {
    it('should set the owner to the contract creator', async () => {
      expect(await contract.owner()).to.equal(owner.address)
    })

    it('should set default values for recovery bond and timeout', async () => {
      expect(await contract.recoveryBond()).to.equal(DEFAULT_RECOVERY_BOND)
      expect(await contract.recoveryTimeout()).to.equal(DEFAULT_RECOVERY_TIMEOUT)
    })

    it('should not have an active recovery attempt', async () => {
      expect(await contract.recoverer()).to.equal(ZERO_ADDRESS)
      expect(await contract.recoveryStart()).to.equal(0)
    })
  })
})

