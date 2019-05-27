pragma solidity ^0.5.0;

/**
 * @author Kelvin Fichter (@kelvinfichter)
 * @notice
 *
 * # Overview
 * Normally, this contract acts as a simple wallet with a single owner.
 * However, the owner also specifies a list of "beneficiaries" who can attempt
 * to "recover" the wallet by taking over ownership of the contract.
 * 
 * # Default Behavior
 * The owner of this contract can send transactions out of the contract by
 * providing a destination, a transaction value, and some transaction data.
 * This allows the wallet to carry out any transaction that a standard keypair
 * could.
 *
 * # Recovery Process
 * This wallet provides a mechanism for the funds in the wallet to be recovered
 * in the case that the owner's keys are no longer accessible. One may want to
 * use this functionality to ensure that funds can be accessed in the case of
 * the owner's death. The owner specifies a set of "beneficiaries" who can
 * attempt to recover the wallet. It's possible, however, that a beneficiary
 * could attempt to steal the funds in the wallet. In order to prevent theft,
 * the beneficiary must place a *bond* to start the recovery attempt and must
 * wait for a *timeout window* to pass. Within the timeout window, the owner
 * can cancel the recovery attempt and take the beneficiary's bond. Once the
 * timeout window has passed, anyone may finalize the recovery process and
 * transfer ownership of the wallet to the recovering beneficiary.
 */
contract DeadXWallet {

    /*
     * Public Variables
     */
    
    address public owner;
    mapping (address => bool) public beneficiaries;

    // Recovery parameters.
    uint256 public recoveryBond;
    uint256 public recoveryTimeout;

    // Information about a recovery attempt.
    address payable public recoverer;
    uint256 public recoveryStart;


    /*
     * Events
     */

    event RecoveryStarted(address indexed _beneficiary);
    event RecoveryFinalized(address indexed _beneficiary);
    event RecoveryCancelled();


    /*
     * Modifiers
     */

    /**
     * @dev [Modifier]
     * @notice Only allows the owner to call the tagged method.
     */
    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "Method can only be called by the owner."
        );

        _;
    }

    /**
     * @dev [Modifier]
     * @notice Only allows beneficiaries to call the tagged method.
     */
    modifier onlyBeneficiary() {
        require(
            beneficiaries[msg.sender],
            "Method can only be called by a beneficiary."
        );

        _;
    }

    /**
     * @dev [Modifier]
     * @notice Only allows calls with a sufficient bond.
     */
    modifier onlyWithBond() {
        require(
            msg.value == recoveryBond,
            "Method can only be called with a sufficient bond."
        );

        _;
    }

    /**
     * @dev [Modifier]
     * @notice Only allows calls when recovery is not active.
     */
    modifier onlyWhileNotRecovering() {
        require(
            !isRecovering(),
            "Method can only be called if there is no active recovery attempt."
        );

        _;
    }

    /**
     * @dev [Modifier]
     * @notice Only allows calls when recovery is active.
     */
    modifier onlyWhileRecovering() {
        require(
            isRecovering(),
            "Method can only be called if there is an active recovery attempt."
        );

        _;
    }

    /**
     * @dev [Modifier]
     * @notice Only allows calls when the recovery timeout is completed.
     */
    modifier onlyWhenTimeoutCompleted() {
        require(
            timeoutCompleted(),
            "Method can only be called if the recovery timeout is completed."
        );

        _;
    }


    /*
     * Public Functions
     */

    /**
     * @dev [Fallback]
     * @notice Allows anyone to send funds to this address.
     */
    function () external payable { }

    /**
     * @dev [Constructor]
     * @notice Sets the contract creator as the contract's owner.
     */
    constructor() public {
        owner = msg.sender;
        recoveryBond = 1 ether;
        recoveryTimeout = 30 days;
    }

    /**
     * @notice Checks whether the contract has an active recovery attempt.
     * @return `true` if the contract has a recovery attempt, `false`
     * otherwise.
     */
    function isRecovering() public view returns (bool) {
        return recoverer != address(0);
    }

    /**
     * @notice Checks whether the recovery timeout has been completed.
     * @return `true` if the timeout is completed, `false` otherwise.
     */
    function timeoutCompleted() public view returns (bool) {
        return (
            isRecovering()
            && (block.timestamp > recoveryStart + recoveryTimeout)
        );
    }

    /**
     * @notice Allows the owner to send any arbitrary transaction.
     * @param _destination Address to send the transaction to.
     * @param _value Amount to send to the address in wei.
     * @param _data Data to send along with the transaction.
     */
    function transact(
        address _destination, 
        uint256 _value,
        bytes memory _data
    )
        public
        onlyOwner
        returns (bytes memory)
    {
        (bool success, bytes memory result) = _destination.call.value(_value)(_data);

        if (!success) {
            revert("Transaction execution failed.");
        }

        return result;
    }

    /**
     * @notice Adds a beneficiary to the wallet.
     * @param _beneficiary Address of the beneficiary.
     */
    function addBeneficiary(address _beneficiary) public onlyOwner {
        beneficiaries[_beneficiary] = true;
    }

    /**
     * @notice Removes a beneficiary from the wallet.
     * @param _beneficiary Address of the beneficiary
     */
    function removeBeneficiary(address _beneficiary) public onlyOwner {
        beneficiaries[_beneficiary] = false;
    }

    /**
     * @notice Changes the required recovery bond amount.
     * @param _bond New bond amount.
     */
    function setRecoveryBond(uint256 _bond) public onlyOwner {
        recoveryBond = _bond;
    }

    /**
     * @notice Changes the length of the recovery timeout period.
     * @param _timeout New timeout period.
     */
    function setRecoveryTimeout(uint256 _timeout) public onlyOwner {
        recoveryTimeout = _timeout;
    }

    /**
     * @notice Allows a beneficiary to start the recovery process.
     */
    function startRecovery()
        public
        payable
        onlyBeneficiary
        onlyWithBond
        onlyWhileNotRecovering
    {
        recoverer = msg.sender;
        recoveryStart = block.timestamp;

        emit RecoveryStarted(msg.sender);
    }

    /**
     * @notice Allows the owner to cancel a recovery attempt.
     * @dev We only need to reset `recoverer` because the recovery attempt
     * can't be finalized if `recoverer` is the zero address. Only way to
     * set `recoverer` again is to start another recovery attempt, which
     * also resets `recoveryStart`.
     */
    function cancelRecovery() public onlyOwner {
        recoverer = address(0);

        emit RecoveryCancelled();
    }

    /**
     * @notice Allows anyone to finalize the recovery process once the recovery
     * timeout window has passed. Sets `recoverer` as the new owner.
     */
    function finalizeRecovery()
        public
        onlyWhileRecovering
        onlyWhenTimeoutCompleted
    {
        owner = recoverer;
        recoverer = address(0);

        emit RecoveryFinalized(owner);
    }
}

