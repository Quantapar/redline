// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// A deliberately vulnerable vault used to exercise the referee engine.
/// The external call precedes the state update, so withdraw() is reentrant.
contract EtherVault {
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

    function totalBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
