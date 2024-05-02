import { expect } from 'chai'
import { Contract } from 'ethers'

const ENABLE_LOGS = false

async function getListItem(MockedList: Contract, key: number) {
  const item = await MockedList.getItem(key)
  return {
    prev: item.prev_.toNumber(),
    next: item.next_.toNumber(),
    count: item.count_,
    key,
  }
}

function print(text: string) {
  if (ENABLE_LOGS)
    console.log(text)
}

function printListItem(n: number, item: any) {
  print(`\t${n + 1}: key=${item.key}, count=${item.count}, next=${item.next}, prev=${item.prev}`)
}

export async function checkList(MockedList: Contract, keys: number[], counters: number[]) {
  if (keys.length != counters.length) throw new Error('keys and counters must have the same length')

  print('== Printing List ============================================\n')
  const expectedListSize = keys.length
  const headKey = await MockedList.getHead()
  if (headKey.toNumber() == 0) {
    expect(expectedListSize).to.be.equal(0)
    print('List is empty!')
    return
  }

  let listSizeCounter = 1
  let currentItem = await getListItem(MockedList, headKey)
  printListItem(0, currentItem)

  expect(currentItem.prev).to.be.equal(0)
  expect(currentItem.key).to.be.equal(keys[0])
  expect(currentItem.count).to.be.equal(counters[0])
  if (currentItem.next === 0) expect(expectedListSize).to.be.equal(1)
  else expect(currentItem.key).to.be.greaterThan(currentItem.next)

  while (currentItem.next != 0) {
    currentItem = await getListItem(MockedList, currentItem.next)
    printListItem(listSizeCounter, currentItem)

    expect(currentItem.prev).to.be.equal(keys[listSizeCounter - 1])
    expect(currentItem.prev).to.be.greaterThan(currentItem.key)

    if (currentItem.next !== 0) expect(currentItem.next).to.be.equal(keys[listSizeCounter + 1])
    expect(currentItem.next).to.be.lessThan(currentItem.key)

    expect(currentItem.key).to.be.equal(keys[listSizeCounter])
    expect(currentItem.count).to.be.equal(counters[listSizeCounter])

    listSizeCounter++
  }

  expect(currentItem.next).to.be.equal(0, 'Tail should point to 0')
  expect(listSizeCounter).to.be.equal(expectedListSize, 'Unexpected list size')
  print('\n== List Ended =============================================')

  const zeroItem = await getListItem(MockedList, 0)
  expect(zeroItem.prev).to.be.equal(0)
  expect(zeroItem.next).to.be.equal(0)
  expect(zeroItem.count).to.be.equal(0)
}
