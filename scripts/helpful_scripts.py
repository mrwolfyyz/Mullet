from brownie import (
    network,
    accounts,
    config,
    interface,
    Contract,
    web3,
    chain,
)
import os
import time


OPENSEA_FORMAT = "https://testnets.opensea.io/assets/{}/{}"

def get_publish_source():
    if network.show_active() in LOCAL_BLOCKCHAIN_ENVIRONMENTS or not os.getenv(
        "ETHERSCAN_TOKEN"
    ):
        return False
    else:
        return True
