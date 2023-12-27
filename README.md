# Nft Roles

[![Coverage Status](https://coveralls.io/repos/github/OriumNetwork/nft-roles/badge.svg?branch=master)](https://coveralls.io/github/OriumNetwork/nft-roles?branch=master)
![Github Badge](https://github.com/OriumNetwork/nft-roles/actions/workflows/all.yml/badge.svg)
[![solidity - v0.8.9](https://img.shields.io/static/v1?label=solidity&message=v0.8.9&color=2ea44f&logo=solidity)](https://github.com/OriumNetwork)
[![License: CC0 v1](https://img.shields.io/badge/License-CC0v1-blue.svg)](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
[![Discord](https://img.shields.io/discord/1009147970832322632?label=discord&logo=discord&logoColor=white)](https://discord.gg/NaNTgPK5rx)
[![Twitter Follow](https://img.shields.io/twitter/follow/oriumnetwork?label=Follow&style=social)](https://twitter.com/OriumNetwork)

[comment]: <> (TODO: Add link and EIP number for ERC-1155 Roles Registry when available)

This repository contains multiple implementations of two EIPs (Ethereum Improvement Proposals):
* ERC-7432 (Non-Fungible Token Roles).
* ERC-TBD (Semi-Fungible Token Roles).

The goal of these EIPs is to introduce role management for NFTs. Each role assignment is associated with one or more
NFTs and expire automatically at a given timestamp. Token Roles can be deeply integrated with dApps to create a
utility-sharing mechanism. A good example is in digital real estate. A user can create a digital property NFT and grant
a `keccak256("PROPERTY_MANAGER")` role to another user, allowing them to delegate specific utility without compromising
ownership. The same user could also grant multiple `keccak256("PROPERTY_TENANT")` roles, allowing additional users to
access the digital property.

You can find the full specification here: [ERC-721 Token Roles](https://eips.ethereum.org/EIPS/eip-7432) and
[ERC-1155 Token Roles](TBD).

## Implementations

* [ERC-7432 NFT Roles Registry](./contracts/RolesRegistry.sol): ERC-721 NFT Owners can grant roles without depositing NFTs.
* [ERC-TBD SFT Roles Registry](./contracts/RolesRegistry/SftRolesRegistry.sol): ERC-1155 NFT Owners can grant roles after depositing NFTs.
* [ERC-TBD Single-Role SFT Roles Registry](./contracts/RolesRegistry/SftRolesRegistrySingleRole.sol): ERC-1155 NFT Owners can grant a single pre-defined role after depositing
  NFTs.

## Build

```bash
npm ci
npm run build
```

## Test

```bash
npm run test
```
