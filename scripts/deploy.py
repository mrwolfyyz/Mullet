#!/usr/bin/python3
from brownie import Mullet, accounts, network, config
from scripts.helpful_scripts import get_publish_source

def main():
    dev = accounts.add(config["wallets"]["from_key"])
    print(network.show_active())
    Mullet.deploy({"from": dev}, publish_source=True)