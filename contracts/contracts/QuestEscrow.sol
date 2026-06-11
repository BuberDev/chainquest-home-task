// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title QuestEscrow
 * @dev Implement all functions so `test/QuestEscrow.assessment.test.ts` passes.
 */
contract QuestEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    enum QuestStatus {
        Open,
        Accepted,
        Submitted,
        Completed,
        Cancelled,
        Refunded
    }
    struct Quest {
        address poster;
        address worker;
        string title;
        string description;
        uint256 reward;
        address token;
        uint256 acceptDeadline;
        uint256 reviewPeriod;
        uint256 reviewDeadline;
        uint256 createdAt;
        QuestStatus status;
        string deliverableURI;
    }

    mapping (uint256 => Quest) private quests;

    uint256 public constant FEE_BPS = 300;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    uint256 public questCount;
    mapping(address => uint256) public availableFees;

    constructor() Ownable(msg.sender) {}

    function _candidateStub() internal pure {
        revert("QuestEscrow: candidate implementation required");
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if(token == address(0)){
            (bool success, )=payable(to).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _completeAndPay(uint256 questId) internal {
        Quest storage quest = quests[questId];

        uint256 fee = (quest.reward * FEE_BPS) / BPS_DENOMINATOR;
        uint256 payout = quest.reward - fee;

        quest.status = QuestStatus.Completed;
        availableFees[quest.token] += fee;

        _transfer(quest.token, quest.worker, payout);    
    }

    function createQuest(
        string calldata title,
        string calldata description,
        uint256 reward,
        uint256 acceptDeadline,
        uint256 reviewPeriod,
        address token
    ) external payable returns (uint256) {
        require(reward > 0, "Invalid reward");
        require(acceptDeadline > block.timestamp, "Accepted deadline must be in future");
        require(reviewPeriod > 0 , "Review period must be getter than 0");
        
        if(token == address(0)){
            require(msg.value == reward, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH not accepted");
            IERC20(token).safeTransferFrom(msg.sender,address(this), reward);
        }

        questCount += 1;
        uint256 questId = questCount;
        quests[questId] = Quest({
            poster: msg.sender,
            worker: address(0),
            title: title,
            description: description,
            reward: reward,
            token: token,
            acceptDeadline: acceptDeadline,
            reviewPeriod: reviewPeriod,
            reviewDeadline: 0,
            createdAt: block.timestamp,
            status: QuestStatus.Open,
            deliverableURI: ""

        });
        return questId;

    }

    function acceptQuest(uint256 questId) external {
        Quest storage quest = quests[questId];
        require(quest.poster != address(0), "Quest not found");
        require(quest.status == QuestStatus.Open, "Not open");
        require(block.timestamp <= quest.acceptDeadline, "Acceptance closed");

        quest.worker = msg.sender;
        quest.status = QuestStatus.Accepted;
    }

    function submitWork(uint256 questId, string calldata deliverableURI) external {
        Quest storage quest = quests[questId];
        require(quest.poster != address(0), "Quest not found");
        require(quest.status == QuestStatus.Accepted, "Not accepted");
        require(msg.sender == quest.worker, "Only worker");

        quest.deliverableURI = deliverableURI;
        quest.reviewDeadline = block.timestamp + quest.reviewPeriod;
        quest.status = QuestStatus.Submitted;
    }

    function approveAndPay(uint256 questId) external nonReentrant {
        Quest storage quest = quests[questId];

        require(quest.poster != address(0), "Quest not found");
        require(msg.sender == quest.poster, "Only poster");
        require(quest.status == QuestStatus.Submitted, "Not submitted");

        _completeAndPay(questId);

    }

    function claimTimeoutPayout(uint256 questId) external nonReentrant {
        Quest storage quest = quests[questId];

        require(quest.poster != address(0), "Quest not found");
        require(quest.status == QuestStatus.Submitted, "Not submitted");
        require(msg.sender == quest.worker, "Only worker");
        require(block.timestamp > quest.reviewDeadline, "Review active");

        _completeAndPay(questId);
    }

    function cancelQuest(uint256 questId) external nonReentrant {
        Quest storage quest = quests[questId];

        require(quest.poster != address(0), "Quest not found");
        require(msg.sender == quest.poster, "Only poster");
        require(quest.status == QuestStatus.Open, "Not open");

        uint256 refundAmount = quest.reward;
        address token = quest.token;
        address poster = quest.poster;

        quest.status = QuestStatus.Cancelled;

        _transfer(token, poster, refundAmount);

    }

    function refundPoster(uint256 questId) external nonReentrant {
        Quest storage quest = quests[questId];

        require(quest.poster != address(0), "Quest not found");
        require(msg.sender == quest.poster, "Only poster");
        require(quest.status == QuestStatus.Submitted, "Not submitted");
        require(block.timestamp > quest.reviewDeadline, "Review active");

        uint256 refundAmount = quest.reward;
        address token = quest.token;
        address poster = quest.poster;

        quest.status = QuestStatus.Refunded;

        _transfer(token, poster, refundAmount);
    }

    function withdrawFees(address token) external onlyOwner nonReentrant {
        uint256 amount = availableFees[token];
        require(amount > 0, "No fees");
        availableFees[token] = 0;

        _transfer(token, msg.sender, amount);
    }

    function getAvailableFees(address token) external view returns (uint256) {
        return availableFees[token];
    }

    function getQuest(uint256 questId)
        external
        view
        returns (
            address poster,
            address worker,
            string memory title,
            string memory description,
            uint256 reward,
            address token,
            uint256 acceptDeadline,
            uint256 reviewPeriod,
            uint256 reviewDeadline,
            uint8 status,
            string memory deliverableURI
    )
    {
        Quest storage quest = quests[questId];
        return (
            quest.poster,
            quest.worker,
            quest.title,
            quest.description,
            quest.reward,
            quest.token,
            quest.acceptDeadline,
            quest.reviewPeriod,
            quest.reviewDeadline,
            uint8(quest.status),
            quest.deliverableURI
        );
    }
}
