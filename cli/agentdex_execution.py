#!/usr/bin/env python3
"""
AgentDEX Execution Module for &milo

This module provides integration with AgentDEX API for swap execution.
When Milo's strategy engine decides to rebalance or trade, this module
handles the actual swap execution through AgentDEX.

Usage:
    from agentdex_execution import AgentDEXExecutor

    executor = AgentDEXExecutor(api_key="your-key")
    
    # Get a quote
    quote = executor.get_quote("USDC", "SOL", 100_000_000)  # 100 USDC
    
    # Execute the swap
    result = executor.execute_swap(quote, wallet_pubkey)

Repo: https://github.com/solana-clawd/agent-dex
"""

import json
import os
import urllib.request
import urllib.error
import urllib.parse
from dataclasses import dataclass
from typing import Optional, Dict, Any, List

# Common Solana token mints
TOKEN_MINTS = {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
}


@dataclass
class Quote:
    """Swap quote from AgentDEX"""
    input_mint: str
    output_mint: str
    input_amount: str
    output_amount: str
    price_impact_pct: float
    other_amount_threshold: str
    raw_response: Dict[str, Any]


@dataclass
class SwapResult:
    """Result of a swap execution"""
    success: bool
    signature: Optional[str]
    input_amount: str
    output_amount: str
    price_impact_pct: float
    error: Optional[str] = None


class AgentDEXExecutor:
    """
    Executor for swaps via AgentDEX API.
    
    Integrates with Milo's strategy layer:
    - Milo decides WHAT to trade (strategy, rebalancing)
    - AgentDEX executes HOW to trade (routing, slippage)
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_slippage_bps: int = 50,  # 0.5%
    ):
        self.api_key = api_key or os.environ.get("AGENTDEX_API_KEY", "")
        self.base_url = base_url or os.environ.get(
            "AGENTDEX_API_URL", 
            "https://agentdex.solana-clawd.dev"
        )
        self.default_slippage_bps = default_slippage_bps
    
    def get_quote(
        self,
        input_token: str,
        output_token: str,
        amount: int,
        slippage_bps: Optional[int] = None,
    ) -> Quote:
        """
        Get a swap quote from AgentDEX.
        
        Args:
            input_token: Token symbol (e.g., "USDC") or mint address
            output_token: Token symbol (e.g., "SOL") or mint address
            amount: Amount in smallest units (lamports, etc.)
            slippage_bps: Slippage tolerance in basis points
        
        Returns:
            Quote object with swap details
        """
        input_mint = self._resolve_mint(input_token)
        output_mint = self._resolve_mint(output_token)
        slippage = slippage_bps or self.default_slippage_bps
        
        params = {
            "inputMint": input_mint,
            "outputMint": output_mint,
            "amount": str(amount),
            "slippageBps": str(slippage),
        }
        
        url = f"{self.base_url}/quote?{urllib.parse.urlencode(params)}"
        response = self._request("GET", url)
        
        return Quote(
            input_mint=response.get("inputMint", input_mint),
            output_mint=response.get("outputMint", output_mint),
            input_amount=response.get("inputAmount", str(amount)),
            output_amount=response.get("outputAmount", "0"),
            price_impact_pct=response.get("priceImpactPct", 0.0),
            other_amount_threshold=response.get("otherAmountThreshold", "0"),
            raw_response=response,
        )
    
    def execute_swap(
        self,
        quote: Quote,
        wallet_pubkey: str,
        dynamic_slippage: bool = True,
    ) -> SwapResult:
        """
        Execute a swap based on a quote.
        
        Args:
            quote: Quote object from get_quote()
            wallet_pubkey: User's wallet public key
            dynamic_slippage: Whether to use dynamic slippage
        
        Returns:
            SwapResult with execution details
        """
        body = {
            "quoteResponse": quote.raw_response,
            "userPublicKey": wallet_pubkey,
            "dynamicSlippage": dynamic_slippage,
        }
        
        url = f"{self.base_url}/swap"
        
        try:
            response = self._request("POST", url, body)
            return SwapResult(
                success=True,
                signature=response.get("swapTransaction"),
                input_amount=quote.input_amount,
                output_amount=quote.output_amount,
                price_impact_pct=quote.price_impact_pct,
            )
        except Exception as e:
            return SwapResult(
                success=False,
                signature=None,
                input_amount=quote.input_amount,
                output_amount="0",
                price_impact_pct=quote.price_impact_pct,
                error=str(e),
            )
    
    def get_portfolio(self, wallet: str) -> Dict[str, Any]:
        """
        Get portfolio holdings for a wallet.
        
        Args:
            wallet: Wallet public key
        
        Returns:
            Portfolio data including token balances
        """
        url = f"{self.base_url}/portfolio/{wallet}"
        return self._request("GET", url)
    
    def get_prices(self, tokens: List[str]) -> Dict[str, float]:
        """
        Get current prices for tokens.
        
        Args:
            tokens: List of token symbols or mints
        
        Returns:
            Dict mapping token to USD price
        """
        mints = [self._resolve_mint(t) for t in tokens]
        params = "&".join(f"ids={m}" for m in mints)
        url = f"{self.base_url}/prices?{params}"
        return self._request("GET", url)
    
    def rebalance(
        self,
        wallet_pubkey: str,
        target_allocations: Dict[str, float],
        current_portfolio: Optional[Dict[str, Any]] = None,
    ) -> List[SwapResult]:
        """
        Rebalance portfolio to target allocations.
        
        This is a convenience method that:
        1. Fetches current portfolio (if not provided)
        2. Calculates required swaps
        3. Executes swaps to reach target
        
        Args:
            wallet_pubkey: Wallet to rebalance
            target_allocations: Dict of token -> target percentage (0-100)
            current_portfolio: Optional current portfolio data
        
        Returns:
            List of SwapResults for executed swaps
        """
        if current_portfolio is None:
            current_portfolio = self.get_portfolio(wallet_pubkey)
        
        # This is a simplified implementation
        # Full implementation would calculate optimal swap sequence
        results = []
        
        total_value = current_portfolio.get("totalValueUsd", 0)
        if total_value == 0:
            return results
        
        tokens = current_portfolio.get("tokens", [])
        current_allocs = {
            t["symbol"]: (t.get("valueUsd", 0) / total_value * 100)
            for t in tokens
        }
        
        for token, target_pct in target_allocations.items():
            current_pct = current_allocs.get(token, 0)
            diff = target_pct - current_pct
            
            if abs(diff) < 1:  # Skip small rebalances
                continue
            
            # Calculate amount to swap
            # This is simplified - full impl would be more sophisticated
            swap_value_usd = abs(diff) / 100 * total_value
            
            if diff > 0:
                # Need more of this token, swap from USDC
                # (Simplified: assumes USDC is available)
                amount = int(swap_value_usd * 1e6)  # USDC has 6 decimals
                quote = self.get_quote("USDC", token, amount)
                result = self.execute_swap(quote, wallet_pubkey)
                results.append(result)
            else:
                # Have too much, swap to USDC
                token_info = next((t for t in tokens if t["symbol"] == token), None)
                if token_info:
                    # Calculate amount to sell
                    amount = int(token_info["balance"] * abs(diff) / current_pct)
                    quote = self.get_quote(token, "USDC", amount)
                    result = self.execute_swap(quote, wallet_pubkey)
                    results.append(result)
        
        return results
    
    def _resolve_mint(self, token: str) -> str:
        """Resolve token symbol to mint address"""
        if len(token) > 10:  # Likely already a mint address
            return token
        return TOKEN_MINTS.get(token.upper(), token)
    
    def _request(
        self,
        method: str,
        url: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make HTTP request to AgentDEX API"""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8")
            raise Exception(f"AgentDEX API error {exc.code}: {error_body}")


# Example usage with Milo
def milo_integration_example():
    """
    Example: Milo strategy decides to rebalance, AgentDEX executes.
    """
    executor = AgentDEXExecutor()
    wallet = "YourWalletPubkeyHere"
    
    # Milo decides: rebalance to 60% SOL, 40% USDC
    target_allocations = {
        "SOL": 60,
        "USDC": 40,
    }
    
    # AgentDEX executes the rebalance
    results = executor.rebalance(wallet, target_allocations)
    
    for result in results:
        if result.success:
            print(f"✓ Swap executed: {result.input_amount} -> {result.output_amount}")
        else:
            print(f"✗ Swap failed: {result.error}")


if __name__ == "__main__":
    milo_integration_example()
