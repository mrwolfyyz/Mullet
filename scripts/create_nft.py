#!/usr/bin/python3
from brownie import nft_airbnb, accounts, network, config
from scripts.helpful_scripts import OPENSEA_FORMAT

sample_token_uri = "ipfs://bafkreiaaodxj7sn67tp3d5vfyabpndrk4qihzi37wp44p4qwfdelbwytpy"


def main():
    dev = accounts.add(config["wallets"]["from_key"])
    print(network.show_active())
    live_nft = nft_airbnb[len(nft_airbnb) - 1]
    token_id = live_nft.tokenCounter()
    transaction = live_nft.create_nft(sample_token_uri, {"from": dev})
    transaction.wait(1)
    print(
        "Awesome! You can view your NFT at {}".format(
            OPENSEA_FORMAT.format(live_nft.address, token_id)
        )
    )
    print('Please give up to 20 minutes, and hit the "refresh metadata" button')