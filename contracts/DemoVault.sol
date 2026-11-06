// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Demo contract for a live Redline scan: a classic reentrancy in withdraw().
/// The external call sends ETH before the balance is zeroed, so a malicious
/// receiver can re-enter and drain the whole vault.
contract DemoVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "no balance");
        (bool ok, ) = msg.sender.call{value: bal}("");
        require(ok, "send failed");
        balances[msg.sender] = 0; // state update AFTER the external call
    }
}
