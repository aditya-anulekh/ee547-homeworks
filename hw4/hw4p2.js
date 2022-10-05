const fs = require('fs')

function watchFileCreated (filename) {
    return new Promise((resolve, reject) => {
        const TIMEOUT = 2000
        const INTERVAL = 100
        const threshold = TIMEOUT / INTERVAL
        let counter = 0
        const interval = setInterval(() => {
            // On some CI runs file is created but not filled
            if (fs.existsSync(filename) && fs.statSync(filename).size !== 0) {
                clearInterval(interval)
                resolve()
            }
            else if (counter <= threshold) {
                counter++
            } 
            else {
                clearInterval(interval)
                reject('file not found')
            }
        }, INTERVAL)
    })
}

exports.fileCat = function(file1, file2, callback) {
    this.separator = ' '
    this.TIMEOUT_MS = 2000
    this.interval = 100

    Promise.all([
        watchFileCreated(file1).catch((error) => error),
        watchFileCreated(file2).catch((error) => error)
    ]).then((values) => {
        if (!values[0] && !values[1]) {
            callback(null, `${fs.readFileSync(file1)} ${fs.readFileSync(file2)}`)
        }
        else if (values[0] && !values[1]) {
            callback(Error('file1 not exist'), null)
        }
        else if (!values[0] && values[1]) {
            callback(Error('file2 not exist'), null)
        }
        else {
            callback(Error('file1 and file2 not exist'), null)
        }
    })
}
