import { Contract } from 'ethers'
import { expect } from 'chai'

/**
 * Validates the list length, order, head and tail
 * @param LinkedLists The MockLinkedLists contract
 * @param listId The bytes32 identifier of the list
 * @param expectedLength The number of items expected in the list
 */
export async function assertList(LinkedLists: Contract, listId: string, expectedLength: number) {
  const headNonce = await LinkedLists.getHeadNonce(listId)
  if (headNonce.toNumber() === 0) {
    return expect(expectedLength, 'List is empty, head should be zero').to.be.equal(0)
  }

  // assert head
  let item = await LinkedLists.getListItem(headNonce)
  expect(item.previous, 'Head previous should be zero').to.be.equal(0)

  let previous = headNonce.toNumber()
  let previousExpirationDate = item.expirationDate.toNumber()
  let next = item.next.toNumber()
  let listLength = 1
  for (; next !== 0; listLength++) {
    item = await LinkedLists.getListItem(next)

    // assert previous
    expect(item.previous, 'Wrong previous item').to.be.equal(previous)

    // assert decreasing order for expiration date
    expect(item.expirationDate.toNumber(), 'Wrong order for expiration date').to.be.lessThanOrEqual(
      previousExpirationDate,
    )

    // update all references
    previous = next
    previousExpirationDate = item.expirationDate.toNumber()
    next = item.next.toNumber()
  }

  // assert tail
  expect(item.next, 'Tail next should be zero').to.be.equal(0)

  // assert list length
  expect(listLength, 'List does not have the expected length').to.be.equal(expectedLength)
}

/**
 * Validates the item nonce, expiration date, and position in the list
 * @param LinkedLists The MockLinkedLists contract
 * @param listId The bytes32 identifier of the list
 * @param itemNonce The nonce of the item
 * @param itemExpirationDate The expiration date of the item
 * @param expectedPosition The expected position of the item in the list
 */
export async function assertListItem(
  LinkedLists: Contract,
  listId: string,
  itemNonce: number,
  itemExpirationDate: number,
  expectedPosition: number,
) {
  const { expirationDate, previous, next } = await LinkedLists.getListItem(itemNonce)
  expect(expirationDate, `Item ${itemNonce} expiration date is not ${itemExpirationDate}`).to.be.equal(
    itemExpirationDate,
  )

  if (expectedPosition === 0) {
    // if item is the head
    expect(await LinkedLists.getHeadNonce(listId), `Item ${itemNonce} should be the head`).to.equal(itemNonce)
    return expect(previous, 'Head previous should be zero').to.be.equal(0)
  }

  // if item is not the head
  expect(previous, 'Item previous should not be zero').to.not.be.equal(0)

  // assert position
  let position = 0
  let currentNonce = (await LinkedLists.getHeadNonce(listId)).toNumber()
  let item = await LinkedLists.getListHead(listId)
  while (currentNonce !== 0) {
    if (currentNonce === itemNonce) {
      return expect(position, 'Item is not on expected position').to.be.equal(expectedPosition)
    }
    item = await LinkedLists.getListItem(currentNonce)
    currentNonce = item.next.toNumber()
    position += 1
  }
  expect.fail('Item not found in list')
}

export async function printList(LinkedLists: Contract, listId: string) {
  console.log('\n== List ==============================================')
  const headNonce = (await LinkedLists.getHeadNonce(listId)).toNumber()
  if (headNonce === 0) {
    return console.log('\tList is empty!')
  }

  let position = 0
  let currentNonce = headNonce
  while (currentNonce !== 0) {
    const currentItem = await LinkedLists.getListItem(currentNonce)
    console.log(`\n\tItem ${position}:`)
    console.log(`\t\tNonce: ${currentNonce}`)
    console.log(`\t\tExpiration Date: ${currentItem.expirationDate}`)
    console.log(`\t\tPrevious: ${currentItem.previous.toNumber()}`)
    console.log(`\t\tNext: ${currentItem.next.toNumber()}`)
    currentNonce = currentItem.next.toNumber()
    position += 1
  }

  console.log('\n== End of List =======================================\n')
}

export function generateRandomInt() {
  return Math.floor(Math.random() * 1000 * 1000) + 1
}
