//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";

interface IWETH9 {
    function deposit() external payable;
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

interface IMockToken {
    function minter() external view returns (address);
    function mint(address to, uint256 value) external;
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IUniswapV3Pool {
    function liquidity() external view returns (uint128);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96)
        external
        payable
        returns (address pool);

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

/// @notice One-time realUSDC/WETH 0.3% Uniswap v3 pool on Sepolia so the demo's clean swap fills.
/// Wraps ETH, mints realUSDC if the sender is its minter, creates and initialises the pool at
/// 1 USDC : 0.00001 WETH and adds one full-range position. A rerun finds the pool with liquidity and stops.
/// Run: `yarn seed-pool` in packages/foundry (keystore selection, then forge asks for the password).
contract SeedPoolScript is Script {
    // Checked on Sepolia at block 12075955: NPM.factory() == FACTORY, NPM.WETH9() == WETH, fee 3000 spacing 60.
    address constant REAL_USDC = 0xf53749FD5e85d4169E95E18FeD40b9A5219FC039; // infra/tokens-manifest.11155111.json
    address constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    IUniswapV3Factory constant FACTORY = IUniswapV3Factory(0x0227628f3F023bb0B980b67D528571c95c6DaC1c);
    INonfungiblePositionManager constant NPM = INonfungiblePositionManager(0x1238536071E1c677A632429e3655c799b22cDA52);

    uint24 constant FEE = 3000;
    // Tick spacing 60: the widest multiples of 60 inside TickMath's +-887272.
    int24 constant TICK_LOWER = -887220;
    int24 constant TICK_UPPER = 887220;

    uint256 constant USDC_AMOUNT = 100e6; // 100 realUSDC (6 decimals)
    uint256 constant WETH_AMOUNT = 0.001 ether; // 100 x 0.00001 WETH (18 decimals)

    // token0 is realUSDC (lower address). Raw price token1/token0 = 1e13 / 1e6 = 1e7.
    // sqrtPriceX96 = floor(sqrt(1e7 * 2^192)).
    uint160 constant SQRT_PRICE_X96 = 250541448375047931186413801569606;

    function run() external {
        require(REAL_USDC < WETH, "token order changed: realUSDC must be token0");
        uint256 priceX192 = 1e7 << 192;
        uint256 s = SQRT_PRICE_X96;
        require(s * s <= priceX192 && (s + 1) * (s + 1) > priceX192, "SQRT_PRICE_X96 is not floor(sqrt(1e7 << 192))");

        address existing = FACTORY.getPool(REAL_USDC, WETH, FEE);
        if (existing != address(0) && IUniswapV3Pool(existing).liquidity() > 0) {
            console.log("Pool already exists with liquidity, nothing to do:", existing);
            console.log("liquidity:", IUniswapV3Pool(existing).liquidity());
            return;
        }
        if (existing != address(0)) console.log("Pool exists without liquidity, adding the position:", existing);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        IMockToken usdc = IMockToken(REAL_USDC);
        IWETH9 weth = IWETH9(WETH);

        uint256 usdcHave = usdc.balanceOf(deployer);
        if (usdcHave < USDC_AMOUNT) {
            // MockToken mint is minter-only. Any other sender must already hold the realUSDC.
            require(
                usdc.minter() == deployer,
                "sender is not the realUSDC minter and holds under 100 realUSDC; send it some or use the minter key"
            );
            usdc.mint(deployer, USDC_AMOUNT - usdcHave);
        }
        uint256 wethHave = weth.balanceOf(deployer);
        if (wethHave < WETH_AMOUNT) weth.deposit{ value: WETH_AMOUNT - wethHave }();

        usdc.approve(address(NPM), USDC_AMOUNT);
        weth.approve(address(NPM), WETH_AMOUNT);

        address pool = NPM.createAndInitializePoolIfNecessary(REAL_USDC, WETH, FEE, SQRT_PRICE_X96);
        // Mins at 99% revert the mint if someone initialised the pool at another price first.
        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = NPM.mint(
            INonfungiblePositionManager.MintParams({
                token0: REAL_USDC,
                token1: WETH,
                fee: FEE,
                tickLower: TICK_LOWER,
                tickUpper: TICK_UPPER,
                amount0Desired: USDC_AMOUNT,
                amount1Desired: WETH_AMOUNT,
                amount0Min: USDC_AMOUNT * 99 / 100,
                amount1Min: WETH_AMOUNT * 99 / 100,
                recipient: deployer,
                deadline: block.timestamp + 1 hours
            })
        );
        vm.stopBroadcast();

        console.log("Pool:", pool);
        console.log("Position tokenId:", tokenId);
        console.log("liquidity:", liquidity);
        console.log("realUSDC in:", amount0);
        console.log("WETH in:", amount1);
    }
}
