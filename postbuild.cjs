const fs = require('fs')
const path = require('path')

function createVersionFile() {
  const packageJson = require('./package.json')
  const version = packageJson.version

  const filePath = path.join(__dirname, 'vuetorrent', 'version.txt')
  fs.writeFileSync(filePath, version)
}

function copyScripts() {
  const src = path.join(__dirname, 'scripts')
  const dest = path.join(__dirname, 'vuetorrent', 'scripts')
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true })
  }
}

createVersionFile()
copyScripts()
