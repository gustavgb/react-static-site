const webpack = require('webpack')
const MemoryFs = require('memory-fs')
const _eval = require('any-eval')
const fs = require('fs-extra')
const path = require('path')
const entry = require('webpack-glob-entry')
const ReactDOMServer = require('react-dom/server')
const ServerStyleSheet = require('styled-components').ServerStyleSheet

let config
try {
  config = _eval(fs.readFileSync('./compile.config.js', 'utf8'))
} catch (e) {
  config = {
    entryDir: 'src/pages',
    template: ({
      title,
      contentForLayout,
      contentForHeader
    }) => `
    <!DOCTYPE html>
    <html lang='en'>
    <head>
      <meta charset='utf-8' />
      <meta http-equiv='X-UA-Compatible' content='IE=edge'>
      <meta name='viewport' content='width=device-width, initial-scale=1'>
      <title>${title}</title>
      ${contentForHeader}
    </head>
    <body>
      ${contentForLayout}
    </body>
    </html>
    `
  }
}

const mapPath = (relPath) => path.join(__dirname, relPath)
const mapKey = (key) => key.split('/').reduce((acc, val) => val)

const relativeEntries = entry(entry.basePath(), config.entryDir + '/*.js')
const absoluteEntries = Object.keys(relativeEntries).reduce((acc, key) => Object.assign(acc, { [mapKey(key)]: mapPath(relativeEntries[key]) }), {})
const listEntries = Object.keys(relativeEntries).map(mapKey)

const flags = process.argv.join(' ').split('--').reduce((acc, flag) => {
  const key = flag.split(' ')[0]
  const value = flag.split(' ')[0] || true
  return Object.assign(acc, { [key]: value })
}, {})

let time

const compile = () => {
  const compiler = webpack({
    context: __dirname,
    entry: absoluteEntries,
    mode: 'development',
    devtool: 'cheap-module-source-map',
    output: {
      path: '/',
      filename: '[name].bundle.js'
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          include: path.join(__dirname, 'src'),
          exclude: /(node_modules|dist)/,
          use: {
            loader: 'babel-loader',
            options: {
              'presets': ['@babel/preset-env', '@babel/preset-react'],
              'plugins': [
                '@babel/plugin-proposal-object-rest-spread',
                'babel-plugin-styled-components'
              ]
            }
          }
        },
        {
          test: /\.(css|sass|scss)$/,
          use: [
            'isomorphic-style-loader',
            {
              loader: 'css-loader',
              options: {
                importLoaders: 1
              }
            }
          ]
        }
      ]
    },
    resolve: {
      modules: [path.join(__dirname, 'src'), path.join(__dirname, 'node_modules')]
    }
  })

  compiler.outputFileSystem = new MemoryFs()

  const webpackHandler = (err, stats) => {
    if (err) throw err

    if (stats.hasErrors() || stats.hasWarnings()) {
      throw new Error(stats.toString({
        errorDetails: true,
        warnings: true
      }))
    }

    time = Date.now()
    let hasCompleted = 0
    const completed = () => {
      hasCompleted++
      if (hasCompleted === listEntries.length) {
        const delta = Date.now() - time

        console.log('Compiled in ' + delta + ' ms.')
      }
    }

    emptyBuildDir(() => {
      for (let i = 0; i < listEntries.length; i++) {
        const result = compiler.outputFileSystem.data[listEntries[i] + '.bundle.js'].toString()

        extractMarkup(result)
          .then((markup) => writeHtmlFile(markup, listEntries[i]))
          .then(copyAssetsFolder)
          .then(completed)
          .catch(console.error)
      }
    })
  }

  if (flags.watch) {
    console.log('Watching for file changes.')

    compiler.watch({
      aggregateTimeout: 300,
      poll: 1000
    }, webpackHandler)
  } else {
    compiler.run(webpackHandler)
  }
}

const debugMessage = (...msg) => flags.verbose && console.log(...msg)

const extractMarkup = (content) => new Promise((resolve, reject) => {
  debugMessage('Extracting HTML.')

  try {
    const app = _eval(content).default
    const sheet = new ServerStyleSheet()
    const layout = ReactDOMServer.renderToStaticMarkup(sheet.collectStyles(app))
    const stylesheet = sheet.getStyleTags()

    const markup = config.template({
      contentForLayout: layout,
      title: 'Gustav\'s Website',
      contentForHeader: stylesheet
    })

    debugMessage('markup:', markup)

    resolve(markup)
  } catch (e) {
    reject(e)
  }
})

const writeHtmlFile = (markup, name) => new Promise((resolve, reject) => {
  debugMessage('Writing HTML file.')

  fs.writeFile(path.join(__dirname, 'build/' + name + '.html'), markup, 'utf8', (err) => {
    if (err) {
      reject(err)
    }
    resolve()
  })
})

const copyAssetsFolder = () => new Promise((resolve, reject) => {
  debugMessage('Copying assets.')

  fs.copy(path.join(__dirname, 'assets'), path.join(__dirname, 'build'), (err) => {
    if (err) {
      reject(err)
    }

    resolve()
  })
})

const emptyBuildDir = (callback) => {
  debugMessage('Emptying build dir.')

  fs.emptyDir(path.join(__dirname, 'build'), (err) => {
    if (err) {
      throw err
    }

    callback()
  })
}

compile()

process.on('exit', (code) => {
  console.log('About to close with code ' + code + '.')
})
