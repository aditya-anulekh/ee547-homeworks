`use strict`

const fs = require('fs');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb')

let PORT = 3000;
const MONGO_CONFIG_FILE = "./config/mongo.json"

const app = express()

const handed_enum = {
    'left': 'L',
    'right': 'R',
    'ambi': 'A'
}

const handed_enum_r = {
    'L': 'left',
    'R': 'right',
    'A': 'ambi'
}


function check_valid_config(file) {
    try {
        JSON.parse(fs.readFileSync(file))
    }
    catch {
        return false;
    }
    return true;
}


class PlayerSourceJson{
    constructor(file) {
        this.config = {}
        // Try requiring the config and if it doesn't exist, use the default config.
        try {
            this.config = require(file)
        }
        catch {
            this.config = {
                "host": "localhost",
                "port": "27017",
                "db": "ee547_hw",
                "opts": {
                    "useUnifiedTopology": true
                }
            }
        }

        // URL to connect with mongodb
        this.uri  = `mongodb://${this.config.host}:${this.config.port}`

        // Create a new MongoClient object and set it as a member variable
        this.client = new MongoClient(this.uri, this.config.opts);

        // Name of the collection we are going to write to inside the database
        this.collection = "player"
    }

    getPlayer(pid, callback) {
        // Try to connect with the MongoClient
        this.client.connect((err, connect) => {
            if (!err) {
                let db = this.client.db(this.config.db)

                // Get the object using the input to the function.
                // Cast it to type ObjectId because mongodb doesn't store IDs as strings
                db.collection(this.collection).find({"_id":ObjectId(pid)}).toArray((err, data)=>{
                    if (!err) {
                        // Check if at least one entry was returned
                        if (data.length > 0) {
                            connect.close()
                            callback(null, data[0])
                        }
                        // Call the callback function with error true if no object is found
                        // with the given ID
                        else {
                            connect.close()
                            callback(true, null)
                        }
                    }
                    // Call the callback function if there was an error in running the query
                    else {
                        connect.close()
                        callback(err, null)
                    }
                })
            }
            // Exit the process with exit code 5 if connection to the mongodb database fails
            else {
                process.exit(5)
            }
        })
    }

    createPlayer(fname, lname, handed, initial_balance, callback) {
        // Try to connect with the mongo client
        this.client.connect((err, connect) => {
            if (!err) {
                // Switch to the current database
                // This command also creates a database if it doesn't exist
                let db = this.client.db(this.config.db)

                // Create a collection to store documents
                db.createCollection(this.collection, (err, collection) => {
                    let player = {
                        fname: fname,
                        lname: lname,
                        handed: handed,
                        is_active: true,
                        created_at: new Date(),
                        balance_usd: Number(initial_balance).toFixed(2),
                    }
                    // Insert the new player into the collection
                    db.collection(this.collection).insertOne(player, (err, data) => {
                        // Call the callback function with the inserted ID if the insert was successful
                        if (!err) {
                            connect.close()
                            callback(null, data.insertedId)
                        }
                        // Call the callback function with error if the insert failed
                        else {
                            connect.close()
                            callback(err, null)
                        }
                    })

                })
            }
            // Exit the process with code 5 if the connection to the mongodb database fails
            else {
                process.exit(5)
            }
        })
    }

    updatePlayer(pid, lname, is_active, deposit_value, callback) {
        // Try to connect with the mongo client
        this.client.connect((err, connect) => {
            if (!err) {
                let db = this.client.db(this.config.db)

                // Create a dictionary to store the updates to be made to the object
                // Set only the keys that have to be updated
                let update_dict = {$set:{}}
                if (lname != null) {
                    update_dict.$set.lname = lname
                }
                if (is_active != null) {
                    update_dict.$set.is_active = is_active
                }
                // Run a query to update the given object
                db.collection(this.collection).updateOne({_id:ObjectId(pid)}, update_dict, (err, data) => {
                    if (!err) {
                        // Check if the update was performed on at least one value
                        if (data.matchedCount > 0) {
                            connect.close()
                            callback(null, data)
                        }
                        // Call the callback function with err=true if no update was performed
                        else {
                            connect.close()
                            callback(true, null)
                        }
                    }
                    // Call the callback function with error if the update failed
                    else {
                        connect.close()
                        callback(err, null)
                    }
                })
            }
            // Exit the process with code 5 if the connection to the mongodb database failed
            else {
                process.exit(5)
            }
        })
    }

    deletePlayer(pid, callback) {
        // Try to connect with the mongo client
        this.client.connect((err, connect) => {
            if (!err) {
                // Switch to the current database
                let db = this.client.db(this.config.db)
                // Query the database to delete the requested entry
                db.collection(this.collection).deleteOne({_id:ObjectId(pid)}, (err, data) => {
                    if (!err) {
                        // Call the callback function if the delete operation was performed
                        if (data.deletedCount > 0) {
                            connect.close()
                            callback(null, data)
                        }
                        // Call the callback function with err=true if no entry was deleted
                        else {
                            connect.close()
                            callback(true, null)
                        }
                    }
                    // Call the callback function with the error if the delete operation failed
                    else {
                        connect.close()
                        callback(err, null)
                    }
                })
            }
            // Exit the process with code 5 if the connection to the mongodb database failed
            else {
                callback(err, null)
            }
        })
    }

    async getBalance(pid, deposit_value, callback) {
        // Try to connect with the mongo client
        this.client.connect(async (err, connect) => {
            if (!err) {
                // Switch to the current database
                let db = this.client.db(this.config.db)
                
                // Get the current balance of the player
                let player = await db.collection(this.collection).findOne({_id:ObjectId(pid)})
                
                // Perform the rest of the operations only if the player exists
                if (player) {
                    // Create the balance_response_object
                    let return_dict = {'old_balance_usd':player?.balance_usd, 'new_balance_usd':null}

                    // Use $set instead of $inc because we are storing balance as a string
                    let update_dict = {$set:{}}

                    if (deposit_value != null) {
                        update_dict.$set.balance_usd = (Number(player?.balance_usd) + (deposit_value > 0 ? deposit_value : 0)).toFixed(2)
                        return_dict.new_balance_usd = update_dict.$set.balance_usd
                    }
                    // Call the update operation on the database
                    db.collection(this.collection).updateOne({_id:ObjectId(pid)}, update_dict, (err, data) => {
                        if (!err) {
                            // Call the callback function with the return dictionary if the deposit was successful
                            if (data.matchedCount > 0) {
                                connect.close()
                                callback(null, return_dict)
                            }
                            // Call the callback function with err=true if no object was updated
                            else {
                                connect.close()
                                callback(true, null)
                            }
                        }
                        // Call the callback function with the error if the update operation failed
                        else {
                            connect.close()
                            callback(err, null)
                        }
                    })
                }
                // Call the callback function with err=true if the player doesn't exist
                else {
                    connect.close()
                    callback(true, null)
                }
            }
            // Exit the process with code 5 if the connection to the mongodb database failed
            else {
                process.exit(5)
            }
        })
    }

    getPlayers(callback) {
        // Try to connect with the mongo client
        this.client.connect((err, connect) => {
            if (!err) {
                // Switch to the current database
                let db = this.client.db(this.config.db)
                db.collection(this.collection).find().toArray((err, data) => {
                    if (!err) {
                        // Get all the players and format according to the response format
                        let players = this._formatPlayer(data)
                        
                        // Sort the players by name
                        players.sort((a, b) => {
                            if (a.name < b.name){
                                return -1
                            }
                            if (a.name > b.name) {
                                return 1
                            }
                
                            return 0
                        })

                        // Call the callback function with the sorted array
                        connect.close()
                        callback(null, players)
                    }
                    // Call the callback function if getting players failed
                    else {
                        connect.close()
                        callback(err, null)
                    }
                })
            }
            // Exit the process with code 5 if conection to the mongodb database failed
            else {
                process.exit(5)
            }
        })
    }

    _formatPlayer(player) {
        // Check if the input if null
        if (player == null) {
            return null
        }

        // Check if the input is an array
        if (Array.isArray(player)) {
            return player.map(this._formatPlayer)
        }
        // Create the response object
        else {
            let return_dict = {
                pid: player._id,
                name: `${player.fname}${player.lname ? ` ${player.lname}`:''}`,
                handed: handed_enum_r[player.handed],
                is_active: player.is_active,
                balance_usd: player.balance_usd
            }
    
            return return_dict
        }
    }
}

// let player_data = new PlayerSourceJson(MONGO_CONFIG_FILE)
// player_data.getPlayer("633b6c18742324bb079953b8", (err, data) => {console.log(data)})

// app.use('/deposit/player/:pid', (req, res, next) => {
//     if (req.method.toLowerCase() == "post") {
//         console.error(req.originalUrl)
//         // console.error(req.query.lname)
//     }
//     next()
// })


// /ping - send status 204
app.get('/ping', (req, res) => {
    res.sendStatus(204);
})


// GET /player 
// - return all players
// - status 200

app.get('/player', (req, res) => {
    let player_data = new PlayerSourceJson(MONGO_CONFIG_FILE)
    player_data.getPlayers((err, data) => {
        if (!err) {
            res.status(200).send(JSON.stringify(data))
        }
    })
})


// GET /player/:pid
// - return 200 and player info if found
// - return 404 if not found

app.get('/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(MONGO_CONFIG_FILE)
    player_data.getPlayer(req.params.pid, (err, data)=>{
        if (!err) {
            let player = player_data._formatPlayer(data)
            res.status(200).send(JSON.stringify(player));
            return
        }
        else {
            let player = null
            res.sendStatus(404)
            return
        }
    })
})


// DELETE /player/:pid
// - redirect to /player with 303
// - send 404 if player not found

app.delete('/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(MONGO_CONFIG_FILE)
    player_data.deletePlayer(req.params.pid, (err, data) => {
        if (!err) {
            res.redirect(303, '/player')
            return
        }
        else {
            res.sendStatus(404)
            return
        }
    })
})


// POST /player
// - redirect to /player/:pid with 303
// - return 422 if invalid fields

app.post('/player', (req, res) => {
    let player_data = new PlayerSourceJson(MONGO_CONFIG_FILE)
    let fname = req.query?.fname
    let lname = req.query?.lname
    let handed = req.query?.handed
    let initial_balance_usd = req.query?.initial_balance_usd

    let resBody = 'invalid_fields: '
    let error = false
    // Validate arguments
    if (!(/^[a-zA-Z]+$/.test(fname))) {
        resBody += 'fname'
        error = true
    }

    if (lname != undefined && !(/(^[a-zA-Z]+$)*/.test(lname))) {
        console.error(`lname: ${lname}`)
        resBody += 'lname'
        error = true
    }

    if (!(['left', 'right', 'ambi'].includes(handed.toLowerCase()))) {
        resBody += 'handed'
        error = true        
    }

    if (isNaN(Number(initial_balance_usd)) || 
        Number(initial_balance_usd) < 0 || 
        Number(initial_balance_usd) != Number(Number(initial_balance_usd).toFixed(2))) {
        resBody += 'initial_balance_usd'
        error = true
    }

    if (!error) {
        player_data.createPlayer(fname, lname, 
            handed_enum[handed.toLowerCase()], initial_balance_usd,
            (err, data) => {
                if (!err) {
                    res.redirect(303, `/player/${data}`)
                }
            })
    }
    else {
        res.status(422).send(resBody)
    }
})


// POST /player/:pid
// - redirect to /player/:pid if update was successful
// - send 404 if player not found
// - send 422 if invalid inputs

app.post('/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(MONGO_CONFIG_FILE)
    let is_active = req.query?.active
    let lname = req.query?.lname
    let error = false

    if (is_active != undefined && ['1', 'true', 't'].includes(is_active.toLowerCase())) {
        is_active = true
    }
    else {
        is_active = false
    }

    if (lname != undefined && !(/(^[a-zA-Z]+$)*/.test(lname))) {
        error = true
    }

    if (!error) {
        player_data.updatePlayer(req.params.pid, lname, is_active, null, (err, data) => {
            if (!err) {
                res.redirect(303, `/player/${req.params.pid}`)
                return
            }
            else {
                res.sendStatus(404)
                return
            }
        })
    }
    else {
        res.sendStatus(422)
        return
    }
})


// POST /deposit/player/:pid
// - send 200 with balance_respose_object
// - send 404 if player not found
// - send 422 if invalid inputs

app.post('/deposit/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(MONGO_CONFIG_FILE)
    deposit_value = req.query?.amount_usd
    let pid = req.params.pid
    
    if (isNaN(Number(deposit_value)) || 
        Number(deposit_value) < 0 || 
        Number(deposit_value) != Number(Number(deposit_value).toFixed(2))) {
        res.sendStatus(400)
        return
    }

    player_data.getBalance(pid, Number(deposit_value), (err, data) => {
        if (!err) {
            res.status(200).send(JSON.stringify(data))
        }
        else {
            res.sendStatus(404)
        }
    })
})


// Check if the file is a valid JSON file before starting the server
if (!check_valid_config(MONGO_CONFIG_FILE)) {
    process.exit(2)
}


// Start the server.
app.listen(PORT, ()=>{})