import express from 'express'
import { exec } from 'child_process'
import path from 'path'
import { statSync, existsSync, readdirSync } from 'fs'

const app = express()

const isFileYoungerThanOneDay = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false
  }
  const stats = statSync(filePath)
  const now = new Date().getTime()
  const modifiedTime = new Date(stats.mtime).getTime()
  const oneDayInMs = 24 * 60 * 60 * 1000
  return now - modifiedTime < oneDayInMs
}

const runTest = (res: any, name: string) => {
  const filePath = path.resolve(__dirname, '../temp/', `${name}.csv`)

  if (isFileYoungerThanOneDay(filePath)) {
    console.log('File is younger than one day, sending cached file...')
    return res.sendFile(filePath)
  }

  console.log(`running test: ${name}`)
  exec(
    `npx playwright test tests/${name}.spec.js`,
    (error, _stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`)
        return res.status(500).send('Error running test')
      }
      if (stderr) {
        console.error(`Stderr: ${stderr}`)
        return res.status(500).send('Error running test')
      }
      console.log('Test completed. Sending file...')
      res.sendFile(filePath, () => console.log('Done sending file.'))
    }
  )
}

const generateRoutes = () => {
  const testFiles = readdirSync(path.resolve(__dirname, '../tests'))
  const routes: string[] = []

  testFiles.forEach((file) => {
    if (file.endsWith('.spec.js')) {
      const name = file.replace('.spec.js', '')
      const route = `/${name}.csv`
      app.get(route, (_req, res) => runTest(res, name))
      routes.push(route)
    }
  })

  return routes
}

const routes = generateRoutes()

app.get('/', (_req, res) => {
  const links = routes
    .map((route) => `<li><a href="${route}">${route}</a></li>`)
    .join('')
  res.send(`<html><body><ul>${links}</ul></body></html>
`)
})

const port = 5000
app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
)
