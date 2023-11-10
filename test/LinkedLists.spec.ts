import { Contract } from 'ethers'
import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import { generateRandomInt, assertListItem, assertList } from './helpers'
const { HashZero } = ethers.constants

describe('LinkedLists', async () => {
  let LinkedLists: Contract

  async function deployContracts() {
    const MockLinkedListsFactory = await ethers.getContractFactory('MockLinkedLists')
    LinkedLists = await MockLinkedListsFactory.deploy()
    return { LinkedLists }
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
  })

  describe('Insert Item', async () => {
    it('when nonce is zero, should revert', async () => {
      await expect(LinkedLists.insert(HashZero, 0, 1)).to.revertedWith('LinkedLists: invalid nonce')
    })

    it('when list is empty, insert item as head', async () => {
      const nonce = generateRandomInt()
      const expirationDate = 1
      await expect(LinkedLists.insert(HashZero, nonce, expirationDate)).to.not.be.reverted
      await assertListItem(LinkedLists, HashZero, nonce, expirationDate, 0)
      await assertList(LinkedLists, HashZero, 1)
    })

    describe('List with one item', async () => {
      let FirstItem: { nonce: number; expirationDate: number }

      beforeEach(async () => {
        FirstItem = { expirationDate: 10, nonce: generateRandomInt() }
        await expect(LinkedLists.insert(HashZero, FirstItem.nonce, FirstItem.expirationDate)).to.not.be.reverted
      })

      it('when expiration date is greater, insert item as head', async () => {
        const newNonce = generateRandomInt()
        const newDate = 11
        await expect(LinkedLists.insert(HashZero, newNonce, newDate)).to.not.be.reverted

        // assert new item
        await assertListItem(LinkedLists, HashZero, newNonce, newDate, 0)
        // assert old item
        await assertListItem(LinkedLists, HashZero, FirstItem.nonce, FirstItem.expirationDate, 1)
        // assert list integrity
        await assertList(LinkedLists, HashZero, 2)
      })

      it('when expiration date is lower, insert item as tail', async () => {
        const newNonce = generateRandomInt()
        const newDate = 9
        await expect(LinkedLists.insert(HashZero, newNonce, newDate)).to.not.be.reverted

        // assert new item
        await assertListItem(LinkedLists, HashZero, newNonce, newDate, 1)
        // assert old item
        await assertListItem(LinkedLists, HashZero, FirstItem.nonce, FirstItem.expirationDate, 0)
        // assert list integrity
        await assertList(LinkedLists, HashZero, 2)
      })

      it('when expiration date is equal, insert item as tail', async () => {
        const newNonce = generateRandomInt()
        await expect(LinkedLists.insert(HashZero, newNonce, FirstItem.expirationDate)).to.not.be.reverted

        // assert new item
        await assertListItem(LinkedLists, HashZero, newNonce, FirstItem.expirationDate, 1)
        // assert old item
        await assertListItem(LinkedLists, HashZero, FirstItem.nonce, FirstItem.expirationDate, 0)
        // assert list integrity
        await assertList(LinkedLists, HashZero, 2)
      })
    })

    describe('List with two items', async () => {
      let FirstItem: { nonce: number; expirationDate: number }
      let SecondItem: { nonce: number; expirationDate: number }

      beforeEach(async () => {
        FirstItem = { expirationDate: 20, nonce: generateRandomInt() }
        SecondItem = { expirationDate: 10, nonce: generateRandomInt() }
        await expect(LinkedLists.insert(HashZero, FirstItem.nonce, FirstItem.expirationDate)).to.not.be.reverted
        await expect(LinkedLists.insert(HashZero, SecondItem.nonce, SecondItem.expirationDate)).to.not.be.reverted
      })

      it('when expiration date is greater, insert item as head', async () => {
        const newNonce = generateRandomInt()
        const newDate = 30
        await expect(LinkedLists.insert(HashZero, newNonce, newDate)).to.not.be.reverted

        await assertListItem(LinkedLists, HashZero, newNonce, newDate, 0)
        await assertListItem(LinkedLists, HashZero, FirstItem.nonce, FirstItem.expirationDate, 1)
        await assertListItem(LinkedLists, HashZero, SecondItem.nonce, SecondItem.expirationDate, 2)
        await assertList(LinkedLists, HashZero, 3)
      })

      it('when expiration date is lower, insert item as tail', async () => {
        const newNonce = generateRandomInt()
        const newDate = 1
        await expect(LinkedLists.insert(HashZero, newNonce, newDate)).to.not.be.reverted

        await assertListItem(LinkedLists, HashZero, newNonce, newDate, 2)
        await assertListItem(LinkedLists, HashZero, FirstItem.nonce, FirstItem.expirationDate, 0)
        await assertListItem(LinkedLists, HashZero, SecondItem.nonce, SecondItem.expirationDate, 1)
        await assertList(LinkedLists, HashZero, 3)
      })

      it('when expiration date is greater than on item but lower than another, insert item in the middle', async () => {
        const newNonce = generateRandomInt()
        const newDate = 15
        await expect(LinkedLists.insert(HashZero, newNonce, newDate)).to.not.be.reverted

        await assertListItem(LinkedLists, HashZero, newNonce, newDate, 1)
        await assertListItem(LinkedLists, HashZero, FirstItem.nonce, FirstItem.expirationDate, 0)
        await assertListItem(LinkedLists, HashZero, SecondItem.nonce, SecondItem.expirationDate, 2)
        await assertList(LinkedLists, HashZero, 3)
      })

    })

  })
})
