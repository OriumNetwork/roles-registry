import { Contract, ethers } from 'ethers'
import { expect } from 'chai'
import { solidityKeccak256 } from 'ethers/lib/utils'

export const ONE_DAY = 60 * 60 * 24
export const ROLE = generateRoleId('UNIQUE_ROLE')

/**
 * Validates the list length, order, head and tail
 * @param LinkedLists The MockLinkedLists contract
 * @param listId The bytes32 identifier of the list
 * @param expectedLength The number of items expected in the list
 */
export async function assertList(LinkedLists: Contract, listId: string, expectedLength: number) {
  const headItemId = await LinkedLists.getHeadItemId(listId)
  if (headItemId.toNumber() === 0) {
    return expect(expectedLength, 'List is empty, head should be zero').to.be.equal(0)
  }

  // assert head
  let item = await LinkedLists.getListItem(headItemId)
  expect(item.previous, 'Head previous should be zero').to.be.equal(0)

  let previous = headItemId.toNumber()
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
 * Validates the item itemId, expiration date, and position in the list
 * @param LinkedLists The MockLinkedLists contract
 * @param listId The bytes32 identifier of the list
 * @param itemId The itemId of the item
 * @param itemExpirationDate The expiration date of the item
 * @param expectedPosition The expected position of the item in the list
 */
export async function assertListItem(
  LinkedLists: Contract,
  listId: string,
  itemId: number,
  itemExpirationDate: number,
  expectedPosition: number,
) {
  const { expirationDate, previous } = await LinkedLists.getListItem(itemId)
  expect(expirationDate, `Item ${itemId} expiration date is not ${itemExpirationDate}`).to.be.equal(itemExpirationDate)

  if (expectedPosition === 0) {
    // if item is the head
    expect(await LinkedLists.getHeadItemId(listId), `Item ${itemId} should be the head`).to.equal(itemId)
    return expect(previous, 'Head previous should be zero').to.be.equal(0)
  }

  // if item is not the head
  expect(previous, 'Item previous should not be zero').to.not.be.equal(0)

  // assert position
  let position = 0
  let currentItem = (await LinkedLists.getHeadItemId(listId)).toNumber()
  let item = await LinkedLists.getListHead(listId)
  while (currentItem !== 0) {
    if (currentItem === itemId) {
      return expect(position, 'Item is not on expected position').to.be.equal(expectedPosition)
    }
    item = await LinkedLists.getListItem(currentItem)
    currentItem = item.next.toNumber()
    position += 1
  }
  expect.fail('Item not found in list')
}

export async function printList(LinkedLists: Contract, listId: string) {
  console.log('\n== List ==============================================')
  const headItemId = (await LinkedLists.getHeadItemId(listId)).toNumber()
  if (headItemId === 0) {
    console.log('\tList is empty!')
    return console.log('== End of List =======================================\n')
  }

  let position = 0
  let currentItemId = headItemId
  while (currentItemId !== 0) {
    const currentItem = await LinkedLists.getListItem(currentItemId)
    console.log(`\n\tItem ${position}:`)
    console.log(`\t\tItemId: ${currentItem}`)
    console.log(`\t\tExpiration Date: ${currentItem.expirationDate}`)
    console.log(`\t\tPrevious: ${currentItem.previous.toNumber()}`)
    console.log(`\t\tNext: ${currentItem.next.toNumber()}`)
    currentItemId = currentItem.next.toNumber()
    position += 1
  }

  console.log('\n== End of List =======================================\n')
}

export function generateRandomInt() {
  return Math.floor(Math.random() * 1000 * 1000) + 1
}

export function generateRoleId(role: string) {
  return solidityKeccak256(['string'], [role])
}

export function generateErc165InterfaceId(contractInterface: ethers.utils.Interface) {
  let interfaceID = ethers.constants.Zero
  const functions: string[] = Object.keys(contractInterface.functions).filter(f => f !== 'supportsInterface(bytes4)')
  for (let i = 0; i < functions.length; i++) {
    interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]))
  }
  return interfaceID
}
