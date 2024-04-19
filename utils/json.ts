import * as fs from 'fs'
import * as path from 'path'

export function updateJsonFile(fileName: string, obj: any) {
  const filePath = path.resolve(fileName)
  console.log(filePath)
  if (fs.existsSync(filePath)) {
    const file = fs.readFileSync(filePath).toString()
    let json = JSON.parse(file)
    json = Object.assign(json, obj)
    fs.writeFileSync(filePath, JSON.stringify(json, null, '\t'))
  }
}
