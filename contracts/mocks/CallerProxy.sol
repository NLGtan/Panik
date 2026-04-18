// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PanikExecutor} from "../PanikExecutor.sol";

contract CallerProxy {
    function callAtomicExit(
        address executor,
        address[] calldata assets
    ) external {
        uint256[] memory emptyTokenIds = new uint256[](0);
        PanikExecutor(executor).atomicExit(assets, emptyTokenIds);
    }
}
