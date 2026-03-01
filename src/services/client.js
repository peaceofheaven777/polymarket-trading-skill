import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from '../../node_modules/@polymarket/clob-client/node_modules/axios/index.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let clobClient = null;
let signer = null;

// Apply proxy if configured
if (config.proxyUrl) {
    const agent = new HttpsProxyAgent(config.proxyUrl);
    // Prevent circular JSON errors when axios logs config
    agent.toJSON = () => `[HttpsProxyAgent: ${config.proxyUrl}]`;
    
    // Patch the specific Axios used by clob-client
    axios.defaults.httpsAgent = agent;
    axios.defaults.httpAgent = agent;
    axios.defaults.proxy = false;
    
    logger.info(`Proxy applied to internal axios: ${config.proxyUrl}`);
}

/**
 * Initialize the Polymarket CLOB client
 * Auto-derives API credentials if not provided in .env
 */
export async function initClient() {
    logger.info('Initializing Polymarket CLOB client...');

    signer = new Wallet(config.privateKey);
    logger.info(`EOA (signer)  : ${signer.address}`);
    logger.info(`Proxy wallet  : ${config.proxyWallet}`);

    // Step 1: Create temp client to derive API credentials
    let apiCreds;
    if (config.clobApiKey && config.clobApiSecret && config.clobApiPassphrase) {
        apiCreds = {
            key: config.clobApiKey,
            secret: config.clobApiSecret,
            passphrase: config.clobApiPassphrase,
        };
        logger.info('Using API credentials from .env');
    } else {
        // Use signature type 0 (EOA) for key derivation
        const tempClient = new ClobClient(config.clobHost, config.chainId, signer, undefined, 0);
        apiCreds = await tempClient.createOrDeriveApiKey();
        logger.info('API credentials derived successfully');
    }

    // Step 2: Initialize full trading client
    // proxyWallet = funder address (where USDC.e is held)
    clobClient = new ClobClient(
        config.clobHost,
        config.chainId,
        signer,
        apiCreds,
        2, // Signature type: 2 = POLY_PROXY (EOA signs on behalf of proxy wallet)
        config.proxyWallet, // Funder = proxy wallet (deposit USDC.e here)
    );

    logger.success('CLOB client initialized');
    return clobClient;
}

/**
 * Get the initialized CLOB client
 */
export function getClient() {
    if (!clobClient) {
        throw new Error('CLOB client not initialized. Call initClient() first.');
    }
    return clobClient;
}

/**
 * Get the signer wallet
 */
export function getSigner() {
    if (!signer) {
        throw new Error('Signer not initialized. Call initClient() first.');
    }
    return signer;
}

/**
 * Get a working Polygon provider using RPC from config
 */
export async function getPolygonProvider() {
    const { ethers } = await import('ethers');
    const provider = new ethers.providers.JsonRpcProvider(config.polygonRpcUrl);
    return provider;
}

/**
 * Get USDC.e balance of the proxy wallet on Polygon
 */
export async function getUsdcBalance() {
    const { ethers } = await import('ethers');
    const provider = await getPolygonProvider();
    const usdcAddress = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const usdc = new ethers.Contract(usdcAddress, abi, provider);
    const balance = await usdc.balanceOf(config.proxyWallet);
    return parseFloat(ethers.utils.formatUnits(balance, 6));
}
