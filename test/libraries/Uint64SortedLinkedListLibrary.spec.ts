import { beforeEach, it } from 'mocha'
import { expect } from 'chai'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'
import { checkList } from './helpers'
import { generateRandomIntBetween } from '../helpers'

describe('Uint64SortedLinkedListLibrary', async () => {
  let MockedList: Contract

  async function deployContracts() {
    const MockedListFactory = await ethers.getContractFactory('MockSortedLinkedList')
    MockedList = await MockedListFactory.deploy()
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
  })

  describe('insert', async () => {
    it('should revert when key is zero', async () => {
      await expect(MockedList.insert(0)).to.be.revertedWith('Uint64SortedLinkedListLibrary: key cannot be zero')
    })

    it('should insert as head and tail when list is empty', async () => {
      expect(await MockedList.insert(1)).to.not.be.reverted
      await checkList(MockedList, [1], [1])
    })

    it('should insert as head when list is not empty', async () => {
      expect(await MockedList.insert(10)).to.not.be.reverted
      expect(await MockedList.insert(11)).to.not.be.reverted
      await checkList(MockedList, [11, 10], [1, 1])
    })

    it('should insert as tail when list is not empty', async () => {
      expect(await MockedList.insert(12)).to.not.be.reverted
      expect(await MockedList.insert(10)).to.not.be.reverted
      await checkList(MockedList, [12, 10], [1, 1])
    })

    it('should insert in the middle of the list', async () => {
      expect(await MockedList.insert(20)).to.not.be.reverted
      expect(await MockedList.insert(10)).to.not.be.reverted
      expect(await MockedList.insert(15)).to.not.be.reverted
      await checkList(MockedList, [20, 15, 10], [1, 1, 1])
    })

    it('should insert the same item', async () => {
      await checkList(MockedList, [], [])
      expect(await MockedList.insert(100)).to.not.be.reverted
      await checkList(MockedList, [100], [1])
      expect(await MockedList.insert(100)).to.not.be.reverted
      await checkList(MockedList, [100], [2])
      expect(await MockedList.insert(100)).to.not.be.reverted
      await checkList(MockedList, [100], [3])
    })

    it('should insert as head multiple times', async () => {
      expect(await MockedList.insert(10)).to.not.be.reverted
      expect(await MockedList.insert(20)).to.not.be.reverted
      expect(await MockedList.insert(30)).to.not.be.reverted
      expect(await MockedList.insert(40)).to.not.be.reverted
      expect(await MockedList.insert(50)).to.not.be.reverted
      await checkList(MockedList, [50, 40, 30, 20, 10], [1, 1, 1, 1, 1])
    })

    it('should insert as tail multiple times', async () => {
      expect(await MockedList.insert(50)).to.not.be.reverted
      expect(await MockedList.insert(40)).to.not.be.reverted
      expect(await MockedList.insert(30)).to.not.be.reverted
      expect(await MockedList.insert(20)).to.not.be.reverted
      expect(await MockedList.insert(10)).to.not.be.reverted
      await checkList(MockedList, [50, 40, 30, 20, 10], [1, 1, 1, 1, 1])
    })

    it('should insert as middle item multiple times', async () => {
      expect(await MockedList.insert(50)).to.not.be.reverted
      expect(await MockedList.insert(10)).to.not.be.reverted

      expect(await MockedList.insert(40)).to.not.be.reverted
      expect(await MockedList.insert(30)).to.not.be.reverted
      expect(await MockedList.insert(20)).to.not.be.reverted

      await checkList(MockedList, [50, 40, 30, 20, 10], [1, 1, 1, 1, 1])
    })
  })

  describe('remove', async () => {
    it('should not do anything when list is empty', async () => {
      expect(await MockedList.remove(1)).to.not.be.reverted
      await checkList(MockedList, [], [])
    })

    it('should not do anything when list has only one different element', async () => {
      expect(await MockedList.insert(1)).to.not.be.reverted
      expect(await MockedList.remove(2)).to.not.be.reverted
      await checkList(MockedList, [1], [1])
    })

    it('should not do anything when list has two different elements', async () => {
      expect(await MockedList.insert(1)).to.not.be.reverted
      expect(await MockedList.insert(2)).to.not.be.reverted
      expect(await MockedList.remove(3)).to.not.be.reverted
      await checkList(MockedList, [2, 1], [1, 1])
    })

    it('should decrease item count when item has more than one occurrence', async () => {
      expect(await MockedList.insert(1)).to.not.be.reverted
      expect(await MockedList.insert(1)).to.not.be.reverted
      expect(await MockedList.insert(2)).to.not.be.reverted
      expect(await MockedList.insert(2)).to.not.be.reverted
      expect(await MockedList.insert(2)).to.not.be.reverted
      expect(await MockedList.remove(1)).to.not.be.reverted
      expect(await MockedList.remove(2)).to.not.be.reverted
      await checkList(MockedList, [2, 1], [2, 1])
    })

    it('should remove head when list has only one element', async () => {
      expect(await MockedList.insert(1)).to.not.be.reverted
      expect(await MockedList.remove(1)).to.not.be.reverted
      await checkList(MockedList, [], [])
    })

    it('should remove head when list has more than one element', async () => {
      expect(await MockedList.insert(10)).to.not.be.reverted
      expect(await MockedList.insert(20)).to.not.be.reverted
      expect(await MockedList.remove(20)).to.not.be.reverted
      await checkList(MockedList, [10], [1])
    })

    it('should remove tail when list has more than one element', async () => {
      expect(await MockedList.insert(10)).to.not.be.reverted
      expect(await MockedList.insert(20)).to.not.be.reverted
      expect(await MockedList.remove(10)).to.not.be.reverted
      await checkList(MockedList, [20], [1])
    })

    it('should remove middle element when list has more than two elements', async () => {
      expect(await MockedList.insert(10)).to.not.be.reverted
      expect(await MockedList.insert(20)).to.not.be.reverted
      expect(await MockedList.insert(30)).to.not.be.reverted
      expect(await MockedList.insert(40)).to.not.be.reverted
      expect(await MockedList.remove(30)).to.not.be.reverted
      await checkList(MockedList, [40, 20, 10], [1, 1, 1])
    })
  })

  // takes up to 25s to run
  describe('Insert & Remove multiple times', async () => {
    it('should insert and remove 100 items', async () => {
      // insert
      const keyList = []
      for (let i = 0; i < 100; i++) {
        const key = generateRandomIntBetween(1, 100)
        keyList.push(key)
        const { keys, counters } = computeLinkedList(keyList)
        expect(await MockedList.insert(key)).to.not.be.reverted
        await checkList(MockedList, keys, counters)
      }

      // remove
      for (let i = keyList.length; i > 0; i--) {
        const key = keyList[i - 1]
        keyList.pop()
        const { keys, counters } = computeLinkedList(keyList)
        expect(await MockedList.remove(key)).to.not.be.reverted
        await checkList(MockedList, keys, counters)
      }
    })
  })
})

function computeLinkedList(list: number[]) {
  const keysMap = list.reduce((acc: { [key: string]: { key: number; count: number } }, key) => {
    if (acc[key.toString()]) {
      acc[key.toString()].count++
    } else {
      acc[key.toString()] = { key, count: 1 }
    }
    return acc
  }, {})

  const keysCounter = Object.keys(keysMap)
    .map(key => keysMap[key])
    .sort((a, b) => b.key - a.key)

  const keys: number[] = []
  const counters: number[] = []
  keysCounter.forEach((item, i) => {
    keys[i] = item.key
    counters[i] = item.count
  })

  return { keys, counters }
}
