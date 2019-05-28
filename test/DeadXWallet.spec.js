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
const expect = chai.expect

const NULL_BYTES = '0x00'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DEFAULT_RECOVERY_BOND = ethers.utils.parseEther('1.0')
const DEFAULT_RECOVERY_TIMEOUT = 30 * 24 * 60 * 60

describe('DeadXWallet', () => {
  const provider = createMockProvider()
  const [
    owner,
    beneficiary,
    attacker,
    recipient,
  ] = getWallets(provider)
  let contract

  /**
   * Set the address that's transacting to the contract.
   * @param account Account to transact from.
   */
  const connect = (account) => {
    contract = contract.connect(account)
  }

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
      expect(await contract.isRecovering()).to.be.false
      expect(await contract.timeoutCompleted()).to.be.false
    })
  })

  describe('fallback', () => {
    it('should allow the owner to send funds to the contract', async () => {
      // Setup
      await expect(owner.sendTransaction({
        to: contract.address,
        value: 12345,
      })).to.not.be.reverted

      // Assert
      expect(await provider.getBalance(contract.address)).to.equal(12345)
    })

    it('should allow someone other than the owner to send funds to the contract', async () => {
      // Setup
      await expect(attacker.sendTransaction({
        to: contract.address,
        value: 12345,
      })).to.not.be.reverted

      // Assert
      expect(await provider.getBalance(contract.address)).to.equal(12345)
    })
  })

  describe('transact', () => {
    it('should allow the owner to send a transaction from the contract', async () => {
      // Setup
      await owner.sendTransaction({
        to: contract.address,
        value: 12345,
      })
      const initialBalance = await provider.getBalance(recipient.address)
      connect(owner)

      // Assert
      await expect(contract.transact(recipient.address, 12345, NULL_BYTES)).to.not.be.reverted
      expect(await provider.getBalance(contract.address)).to.equal(0)
      expect(await provider.getBalance(recipient.address)).to.equal(initialBalance.add(12345))
    })

    it('should revert if the contract does not have enough balance', async () => {
      // Setup
      connect(owner)

      // Assert
      await expect(contract.transact(recipient.address, 12345, NULL_BYTES)).to.be.reverted
    })

    it('should not allow someone other than the owner to send a transaction from the contract', async () => {
      // Setup
      await owner.sendTransaction({
        to: contract.address,
        value: 12345,
      })
      connect(attacker)

      // Assert
      await expect(contract.transact(attacker.address, 12345, NULL_BYTES)).to.be.reverted
      expect(await provider.getBalance(contract.address)).to.equal(12345)
    })
  })

  describe('addBeneficiary', () => {
    it('should allow the owner to add a beneficiary', async () => {
      // Setup
      connect(owner)

      // Assert
      await expect(contract.addBeneficiary(beneficiary.address)).to.not.be.reverted
      expect(await contract.beneficiaries(beneficiary.address)).to.be.true
    })

    it('should not allow someone other than the owner to add a beneficiary', async () => {
      // Setup
      connect(attacker)

      // Assert
      await expect(contract.addBeneficiary(beneficiary.address)).to.be.reverted
      expect(await contract.beneficiaries(beneficiary.address)).to.be.false
    })
  })

  describe('removeBeneficiary', () => {
    it('should allow the owner to remove a beneficiary', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)

      // Assert
      await expect(contract.removeBeneficiary(beneficiary.address)).to.not.be.reverted
      expect(await contract.beneficiaries(beneficiary.address)).to.be.false
    })

    it('should not allow someone other than the owner to remove a beneficiary', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(attacker)

      // Assert
      await expect(contract.removeBeneficiary(beneficiary.address)).to.be.reverted
      expect(await contract.beneficiaries(beneficiary.address)).to.be.true
    })
  })

  describe('setRecoveryBond', () => {
    it('should allow the owner to set the recovery bond', async () => {
      // Setup
      connect(owner)

      // Assert
      await expect(contract.setRecoveryBond(12345)).to.not.be.reverted
      expect(await contract.recoveryBond()).to.equal(12345)
    })

    it('should not allow someone other than the owner to set the recovery bond', async () => {
      // Setup
      connect(attacker)

      // Assert
      await expect(contract.setRecoveryBond(12345)).to.be.reverted
      expect(await contract.recoveryBond()).to.equal(DEFAULT_RECOVERY_BOND)
    })
  })
  
  describe('setRecoveryTimeout', () => {
    it('should allow the owner to set the recovery timeout', async () => {
      // Setup
      connect(owner)

      // Assert
      await expect(contract.setRecoveryTimeout(12345)).to.not.be.reverted
      expect(await contract.recoveryTimeout()).to.equal(12345)
    })

    it('should not allow someone other than the owner to set the recovery timeout', async () => {
      // Setup
      connect(attacker)

      // Assert
      await expect(contract.setRecoveryTimeout(12345)).to.be.reverted
      expect(await contract.recoveryTimeout()).to.equal(DEFAULT_RECOVERY_TIMEOUT)
    })
  })

  describe('startRecovery', () => {
    it('should allow a beneficiary to start a recovery attempt', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)

      // Assert
      await expect(contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })).to.emit(contract, 'RecoveryStarted').withArgs(beneficiary.address)
      expect(await contract.isRecovering()).to.be.true
      expect(await contract.recoverer()).to.equal(beneficiary.address)
      expect(await contract.recoveryStart()).to.equal(
        (await provider.getBlock(await provider.getBlockNumber())).timestamp
      )
    })

    it('should not allow two active recovery attempts', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)
      await contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })

      // Assert
      await expect(contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })).to.be.reverted
    })

    it('should require the beneficiary to place the recovery bond', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)
      
      // Assert
      await expect(contract.startRecovery({
        value: 0,
      })).to.be.reverted
      expect(await contract.isRecovering()).to.be.false
    })

    it('should not allow someone other than a beneficiary to start a recovery attempt', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(attacker)

      // Assert
      await expect(contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })).to.be.reverted
      expect(await contract.isRecovering()).to.be.false
    })
  })

  describe('cancelRecovery', () => {
    it('should allow the owner to cancel a recovery attempt', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)
      await contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })
      connect(owner)

      // Assert
      await expect(contract.cancelRecovery()).to.emit(contract, 'RecoveryCancelled')
      expect(await contract.isRecovering()).to.be.false
    })

    it('should not allow someone other than the owner to cancel a recovery attempt', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)
      await contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })
      connect(attacker)

      // Assert
      await expect(contract.cancelRecovery()).to.be.reverted
      expect(await contract.isRecovering()).to.be.true
    })
  })

  describe('finalizeRecovery', () => {
    it('should allow anyone to finalize a recovery attempt after the timeout', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)
      await contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })
      await provider.send('evm_increaseTime', [DEFAULT_RECOVERY_TIMEOUT + 1])

      // Assert
      expect(await contract.timeoutCompleted()).to.be.true
      await expect(contract.finalizeRecovery())
        .to.emit(contract, 'RecoveryFinalized').withArgs(beneficiary.address)
      expect(await contract.owner()).to.equal(beneficiary.address)
      expect(await contract.isRecovering()).to.be.false
    })

    it('should not allow anyone to finalize before the timeout is complete', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)
      await contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })

      // Assert
      expect(await contract.timeoutCompleted()).to.be.false
      await expect(contract.finalizeRecovery()).to.be.reverted
      expect(await contract.isRecovering()).to.be.true
    })

    it('should not allow anyone to finalize if no recovery is active', async () => {
      // Setup
      connect(owner)
      await contract.addBeneficiary(beneficiary.address)
      connect(beneficiary)
      await contract.startRecovery({
        value: DEFAULT_RECOVERY_BOND,
      })
      connect(owner)
      await contract.cancelRecovery()
      await provider.send('evm_increaseTime', [DEFAULT_RECOVERY_TIMEOUT + 1])
      connect(beneficiary)

      // Assert
      expect(await contract.timeoutCompleted()).to.be.false
      await expect(contract.finalizeRecovery()).to.be.reverted
      expect(await contract.isRecovering()).to.be.false
    })
  })
})

