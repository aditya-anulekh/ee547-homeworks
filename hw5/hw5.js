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

const kErrors = {
    kNotFoundError: class kNotFoundError extends Error {},
    kInActiveMatch: class kInActiveMatch extends Error {},
    kInsufficientFunds: class kInsufficientFunds extends Error {},
    kMatchNotActive: class kMatchNotActive extends Error {}
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


class Database {
    constructor(client) {
        this.client = client
    }

    async _connect() {
        try {
            await this.client.connect()
            // console.log("Connection to database established!")
            return true
        }
        catch {
            process.exit(5)
        }
        // finally{this.client.close()}
    }
}


class Validator {
    static _validate_fname(fname) {
        if (!(/^[a-zA-Z]+$/.test(fname))) {
            return false
        }
        return true
    }

    static _validate_lname(lname) {
        if (lname != undefined && !(/(^[a-zA-Z]+$)*/.test(lname))) {
            return false
        }
        return true
    }

    static _validate_handed(handed) {
        if (!(['left', 'right', 'ambi'].includes(handed.toLowerCase()))) {
            return false       
        }
        return true
    }

    static _validate_balance(balance) {
        if (isNaN(Number(balance)) || 
        Number(balance) < 0 || !Number.isInteger(Number(balance))) {
            return false
        }
        return true
    }

    static _validate_positive_integer(num) {
        if (Number(num) <= 0 || 
            !Number.isInteger(Number(num)) || 
            /^(\d)*\.(\d)*$/.test(num)) {
            return false
        }
        return true
    }

    static _validate_ObjectId(id) {
        if (!ObjectId.isValid(id)) {
            return false
        }
        return true
    }
}


class PlayersDatabase {
    constructor(file) {
        this.config = {
            "host": "localhost",
            "port": "27017",
            "db": "ee547_hw",
            "opts": {
                "useUnifiedTopology": true
            }
        }
        
        // Try requiring the config from the file and update the default config
        try {
            let conf = require(file)
            this.config = {...this.config, ...conf}
        }
        catch (err) {
            console.error(err)
        }

        // console.log(this.config)
        
        // URL to connect with mongodb
        this.uri = `mongodb://${this.config.host}:${this.config.port}`

        // Create a new MongoClient, set it as a member variable and establish the connection
        this.client = new MongoClient(this.uri, this.config.opts)

        new Database(this.client)._connect()

        // Set the database as a member variable
        this.db = this.client.db(this.config.db)

        // Name of the collection where players are stored
        this.player = 'player'

        // Name of the collection where matches are stored
        this.match = 'match'
    }

    async getPlayer(pid) {
        let result;
        try {
            result = await this.db.collection(this.player).findOne({'_id':ObjectId(pid)})
            if (!result) {
                throw new kErrors.kNotFoundError()
            }
        }
        finally {}
        return this._formatPlayer(result)
    }

    async getPlayers() {
        let result;
        try {
            result = await this.db.collection(this.player).find({}).toArray()
            result = this._formatPlayer(result)
            result.sort((a, b) => {
                if (a.name < b.name){
                    return -1
                }
                if (a.name > b.name) {
                    return 1
                }
    
                return 0
            })
        }
        finally {}
        return result
    }

    async createPlayer(fname, lname, handed, initial_balance_usd) {
        let result;
        let player = {
            fname:fname,
            lname:lname,
            handed:handed,
            is_active:true,
            balance_usd_cents:initial_balance_usd,
            created_at:new Date(),
            num_join:0,
            num_won:0,
            num_dq:0,
            total_points:0,
            total_prize_usd_cents:0,
            in_active_match:null
        }
        try {
            result = await this.db.collection(this.player).insertOne(player)
        }
        finally {}
        return result.insertedId
    }

    async updatePlayer(pid, lname, is_active) {
        let updated = false
        let result;

        // Create a dictionary to store the updates to be made to the object
        // Set only the keys that have to be updated
        let update_dict = {$set:{}}

        if (lname != null) {
            update_dict.$set.lname = lname
        }
        if (is_active != null) {
            update_dict.$set.is_active = is_active
        }

        try {
            result = await this.db.collection(this.player).updateOne({'_id':ObjectId(pid)}, update_dict)
            if (result.matchedCount > 0) {
                updated = true
            }
            else {
                throw new kErrors.kNotFoundError()
            }
        }
        finally {}
        return updated
    }

    async deletePlayer(pid) {
        let deleted = false
        let result;
        try {
            result = await this.db.collection(this.player).deleteOne({'_id':ObjectId(pid)})
            if (!result) {
                throw new kErrors.kNotFoundError()
            }
            else if (result.deletedCount > 0) {
                deleted = true
            }
            else {
                throw new kErrors.kNotFoundError()
            }
        }
        finally {}
        return deleted
    }

    async getBalance(pid, deposit_value) {       
        let deposited = false
        let result;
        let player;
        let return_dict;

        // Create a dictionary to store the updates to be made to the object
        // Set only the keys that have to be updated
        let update_dict = {$inc:{balance_usd_cents:deposit_value}}

        try {
            player = await this.db.collection(this.player).findOne({'_id':ObjectId(pid)})
            return_dict = {
                'old_balance_usd_cents':player?.balance_usd_cents, 
                'new_balance_usd_cents':null
            }
            
            if (player) {
                result = await this.db.collection(this.player).updateOne({'_id':ObjectId(pid)}, update_dict)
                if (result.matchedCount > 0) {
                    return_dict.new_balance_usd_cents = update_dict.$inc.balance_usd_cents + player?.balance_usd_cents
                    deposited = true
                }    
            }
            else {
                throw new kErrors.kNotFoundError()
            }
        }
        finally {}
        return return_dict
    }

    async getMatch(mid) {
        let result;
        try {
            result = await this.db.collection(this.match).findOne({'_id':ObjectId(mid)})
            if (!result) {
                throw new kErrors.kNotFoundError()
            }
        }
        finally {}
        return this._formatMatch(result)
    }

    async getMatches() {
        let result = [];
        let active_matches = [];
        let ended_matches = [];
        try {
            active_matches = await this.db.collection(this.match).find({ended_at:null}).toArray()
            if (active_matches.length > 0) {
                active_matches = await this._formatMatch(active_matches)
                Promise.all(active_matches).then((values) => {
                    values.sort((a, b) => {
                        if (a.prize_usd_cents < b.prize_usd_cents){
                            return 1
                        }
                        if (a.prize_usd_cents > b.prize_usd_cents) {
                            return -1
                        }
            
                        return 0
                    })
                    active_matches = values
                })
            }

            ended_matches = await this.db.collection(this.match).find({ended_at:{$ne:null}}).toArray()
            if (ended_matches.length > 0) {
                ended_matches = await this._formatMatch(ended_matches)
                Promise.all(ended_matches).then((values) => {
                    values.sort((a, b) => {
                        if (a.ended_at < b.ended_at){
                            return 1
                        }
                        if (a.ended_at > b.ended_at) {
                            return -1
                        }
            
                        return 0
                    })
                    ended_matches = values
                })
            }
            result = [...active_matches, ...ended_matches.slice(0, 4)]
        }
        finally {}
        return result
    }

    async createMatch(pid1, pid2, entry_fee_usd_cents, prize_usd_cents) {
        let result;
        let player1
        let player2;
        // Check if the players exist
        try {
            player1 = await this.db.collection(this.player).findOne({_id:ObjectId(pid1)})
            player2 = await this.db.collection(this.player).findOne({_id:ObjectId(pid2)})
            if (!player1 || !player2) {
                throw new kErrors.kNotFoundError()
            }

            // Check if the players are in an active match currently
            if (player1.in_active_match || player2.in_active_match) {
                throw new kErrors.kInActiveMatch()
            }

            // Check if the players have sufficient funds
            if (player1.balance_usd_cents < entry_fee_usd_cents || 
                player2.balance_usd_cents < entry_fee_usd_cents) {
                throw new kErrors.kInsufficientFunds()
            }

            // Create the match if all the above conditions are satisfied
            let match = {
                created_at: new Date(),
                ended_at: null,
                entry_fee_usd_cents: entry_fee_usd_cents,
                is_dq: false,
                p1_id: pid1,
                p1_points: 0,
                p2_id: pid2,
                p2_points: 0,
                prize_usd_cents: prize_usd_cents
            }

            // Insert the above document into the collection
            result = await this.db.collection(this.match).insertOne(match)

            // Update player's balance and match ID
            let update_dict = {
                $inc:{balance_usd_cents:-1*match.entry_fee_usd_cents, num_join:1},
                $set:{in_active_match:result.insertedId}
            }

            await this.db.collection(this.player).updateOne({_id:ObjectId(match.p1_id)}, update_dict)
            await this.db.collection(this.player).updateOne({_id:ObjectId(match.p2_id)}, update_dict)

        }
        finally{}

        return result.insertedId
    }

    async awardPoints(mid, pid, points) {
        let player;
        let match;

        try {
            player = await this.db.collection(this.player).findOne({_id:ObjectId(pid)})

            match = await this.db.collection(this.match).findOne({_id:ObjectId(mid)})

            if (!match || !player) {
                throw new kErrors.kNotFoundError()
            }

            if (match.ended_at != null) {
                throw new kErrors.kMatchNotActive()
            }

            if (pid != match.p1_id && pid != match.p2_id) {
                throw new Error()
            }

            let match_update = {$inc:{
                p1_points: pid == match.p1_id ? points : 0,
                p2_points: pid == match.p2_id ? points : 0
            }}

            let player_update = {$inc:{
                total_points: points
            }}

            // Update match
            await this.db.collection(this.match).updateOne({_id:ObjectId(mid)}, match_update)

            // Update player
            await this.db.collection(this.player).updateOne({_id:ObjectId(pid)}, player_update)
        }
        finally{}

        return this._formatMatch(await this.db.collection(this.match).findOne({_id:ObjectId(mid)}))
    }

    async endMatch(mid) {
        let match;
        try {
            match = await this.db.collection(this.match).findOne({_id:ObjectId(mid)})
            if (!match) {
                throw new kErrors.kNotFoundError()
            }

            if (match.ended_at != null || match.p1_points === match.p2_points) {
                throw new kErrors.kMatchNotActive()
            }

            let winner_pid = match.p1_points > match.p2_points ? match.p1_id : match.p2_id

            let match_update = {
                $set: {ended_at: new Date(), winner_pid: ObjectId(winner_pid)}
            }

            let player_update = {
                $set: {in_active_match:null}
            }

            let winner_update = {
                $inc: {num_won: 1, balance_usd_cents:match.prize_usd_cents, total_prize_usd_cents:match.prize_usd_cents}
            }

            // Update the match
            await this.db.collection(this.match).updateOne({_id:ObjectId(mid)}, match_update)

            // Update all the players in the match
            await this.db.collection(this.player).updateMany({in_active_match:ObjectId(mid)}, player_update)

            // Update the winner
            await this.db.collection(this.player).updateOne({_id:ObjectId(winner_pid)}, winner_update)
        }
        finally {}
        return this._formatMatch(await this.db.collection(this.match).findOne({_id:ObjectId(mid)}))
    }

    async disqualifyMatch(mid, pid) {
        let match;
        let player;
        try {
            match = await this.db.collection(this.match).findOne({_id:ObjectId(mid)})
            player = await this.db.collection(this.player).findOne({_id:ObjectId(pid)})

            if (!match || !player) {
                throw new kErrors.kNotFoundError()
            }

            if (match.ended_at != null) {
                throw new kErrors.kMatchNotActive()
                
            }

            if (pid != match.p1_id && pid != match.p2_id) {
                throw new Error()
            }

            // Set the other player as the winner
            let winner_pid = pid == match.p1_id ? match.p2_id : match.p1_id

            let match_update = {
                $set: {ended_at: new Date(), winner_pid: ObjectId(winner_pid), is_dq:true}
            }

            let player_update = {
                $set: {in_active_match:null}
            }

            let winner_update = {
                $inc: {num_won: 1, balance_usd_cents:match.prize_usd_cents, total_prize_usd_cents:match.prize_usd_cents}
            }

            let dq_update = {
                $inc: {num_dq:1}
            }

            // Update the match
            await this.db.collection(this.match).updateOne({_id:ObjectId(mid)}, match_update)

            // Update all the players in the match
            await this.db.collection(this.player).updateMany({in_active_match:ObjectId(mid)}, player_update)

            // Update the winner
            await this.db.collection(this.player).updateOne({_id:ObjectId(winner_pid)}, winner_update)

            // Update the disqualified player
            await this.db.collection(this.player).updateOne({_id:ObjectId(pid)}, dq_update)
        }
        finally {}
        return this._formatMatch(await this.db.collection(this.match).findOne({_id:ObjectId(mid)}))
    }

    _formatPlayer(player) {
        // Check if input is null
        if (player == null) {
            return null
        }

        // Check if input is an array
        if (Array.isArray(player)) {
            return player.map(this._formatPlayer)
        }
        else {
            let return_dict = {
                pid: player._id,
                name: `${player.fname}${player.lname ? ` ${player.lname}`:''}`,
                handed: handed_enum_r[player.handed],
                is_active: player.is_active,
                balance_usd_cents: player.balance_usd_cents,
                num_join:player.num_join ? player.num_join:0,
                num_won:player.num_won ? player.num_won:0,
                num_dq:player.num_dq ? player.num_dq:0,
                total_points:player.total_points ? player.total_points:0,
                total_prize_usd_cents:player.total_prize_usd_cents ? player.total_prize_usd_cents:0,
                in_active_match:player.in_active_match ? player.in_active_match:null,
                efficiency:(player.num_join > 0) ? (player.num_won/player.num_join) : 0
            }
            return return_dict
        }
        
    }

    _formatMatch(match) {
        // console.log(match)
        if (match == null) {
            return null
        }

        if (Array.isArray(match)) {
            return Promise.all(match.map(this._formatMatch, this))
        }
        else {
            // console.log(match.p1_id)
            // // console.log(match.p2_id)
            // let p1 = this.db.collection(this.player).findOne({_id:ObjectId(match.p1_id)})
            // let p2 = this.db.collection(this.player).findOne({_id:ObjectId(match.p2_id)})
            let p1 = '';
            let p2 = '';
            let values;
            let return_dict = Promise.all([
                this.getPlayer(match.p1_id),
                this.getPlayer(match.p2_id)        
            ]).then((vals) => {
                return_dict = {
                    mid: match._id,
                    entry_fee_usd_cents: match.entry_fee_usd_cents,
                    p1_id: match.p1_id,
                    // p1_name: `${p1?.fname}${p1?.lname ? ` ${p1?.lname}`:''}`,
                    p1_name: vals[0].name,
                    p1_points: match?.p1_points ? match.p1_points : 0,
                    p2_id: match.p2_id,
                    // p2_name: `${p2?.fname}${p2?.lname ? ` ${p2?.lname}`:''}`,
                    p2_name: vals[1].name,
                    p2_points: match?.p2_points ? match.p2_points : 0,
                    winner_pid: match?.ended_at ? match.winner_pid : null,
                    is_dq: match?.is_dq ? match.is_dq : false,
                    is_active: match?.ended_at == null ? true:false,
                    prize_usd_cents: match.prize_usd_cents,
                    age: Math.floor((new Date() - match.created_at)/1000),
                    ended_at: match?.ended_at ? match.ended_at : null
                }
                return return_dict
            })
            // this.getPlayer(match.p1_id).then(values => {p1 = values.name}).catch(err => {p1 = "Dummy Name"})
            // this.getPlayer(match.p2_id).then(values => {p2 = values.name}).catch(err => {p2 = "Dummy Name"})
            // console.log(p1)
            // console.log(p2)
            // let return_dict = {
            //     mid: match._id,
            //     entry_fee_usd_cents: match.entry_fee_usd_cents,
            //     p1_id: match.p1_id,
            //     // p1_name: `${p1?.fname}${p1?.lname ? ` ${p1?.lname}`:''}`,
            //     p1_name: p1,
            //     p1_points: match?.p1_points ? match.p1_points : 0,
            //     p2_id: match.p2_id,
            //     // p2_name: `${p2?.fname}${p2?.lname ? ` ${p2?.lname}`:''}`,
            //     p2_name: p2,
            //     p2_points: match?.p2_points ? match.p2_points : 0,
            //     winner_pid: match?.ended_at ? match.winner_pid : null,
            //     is_dq: match?.is_dq ? match.is_dq : false,
            //     is_active: match?.ended_at == null ? true:false,
            //     prize_usd_cents: match.prize_usd_cents,
            //     age: Math.floor((new Date() - match.created_at)/1000),
            //     ended_at: match?.ended_at ? match.ended_at : null
            // }
            // console.log(return_dict)
            return return_dict
        }
    }
}

let player_data = new PlayersDatabase(MONGO_CONFIG_FILE)

// app.use('*', (req, res, next) => {
//     console.log(req.originalUrl)
//     next()
// })

// /ping - send status 204
app.get('/ping', (req, res) => {
    res.sendStatus(204);
})

/* Player Endpoints begin from here */

// GET /player 
// - return all players
// - status 200

app.get('/player', async (req, res) => {
    await player_data.getPlayers().then((player) => {
        res.status(200).send(player)
    })
})


// GET /player/:pid
// - return 200 and player info if found
// - return 404 if not found

app.get('/player/:pid', async (req, res) => {
    await player_data.getPlayer(req.params.pid).then((player) => {
        res.status(200).send(JSON.stringify(player))
    }).catch((err) => res.sendStatus(404))
})

// DELETE /player/:pid
// - redirect to /player with 303
// - send 404 if player not found

app.delete('/player/:pid', async (req, res) => {
    await player_data.deletePlayer(req.params.pid).then((result) => {
        res.redirect(303, '/player')
    }).catch((err) => res.sendStatus(404))
})

// POST /player
// - redirect to /player/:pid with 303
// - return 422 if invalid fields

app.post('/player', async (req, res) => {
    let fname = req.query?.fname
    let lname = req.query?.lname
    let handed = req.query?.handed
    let initial_balance_usd_cents = req.query?.initial_balance_usd_cents

    let resBody = 'invalid_fields: '
    let error = false

    // Validate arguments

    if (!Validator._validate_fname(fname)) {
        resBody += 'fname'
        error = true
    }

    if (!Validator._validate_lname(lname)) {
        resBody += 'lname'
        error = true
    }

    if (!Validator._validate_handed(handed)) {
        resBody += 'handed'
        error = true
    }

    if (!Validator._validate_balance(initial_balance_usd_cents)) {
        resBody += 'balance_usd_cents'
        error = true
    }

    if (!error) {
        await player_data.createPlayer(fname, lname, 
            handed_enum[handed.toLowerCase()], Number(initial_balance_usd_cents)).then((result) => {
                res.redirect(303, `/player/${result}`)
            }).catch((err) => res.sendStatus(500))
    }
    else {
        res.status(422).send(resBody)
    }
})

// POST /player/:pid
// - redirect to /player/:pid if update was successful
// - send 404 if player not found
// - send 422 if invalid inputs

app.post('/player/:pid', async (req, res) => {
    let is_active = req.query?.active
    let lname = req.query?.lname
    let error = false

    if (is_active != undefined && ['1', 'true', 't'].includes(is_active.toLowerCase())) {
        is_active = true
    }
    else {
        is_active = false
    }

    if (!Validator._validate_lname(lname)) {
        error = true
    }

    if (!error) {
        await player_data.updatePlayer(req.params.pid, lname, is_active).then(result => {
            if (result) {res.redirect(303, `/player/${req.params.pid}`)}
        }).catch(err => res.sendStatus(404))
    }
    else {
        res.status(422).send(resBody)
    }
})

// POST /deposit/player/:pid
// - send 200 with balance_respose_object
// - send 404 if player not found
// - send 422 if invalid inputs

app.post('/deposit/player/:pid', async (req, res) => {
    let deposit_value = req.query?.amount_usd_cents
    let pid = req.params.pid
    
    if (!Validator._validate_balance(deposit_value)) {
        res.sendStatus(400)
        return
    }

    await player_data.getBalance(req.params.pid, Number(deposit_value)).then(result => {
        res.status(200).send(JSON.stringify(result))
    }).catch(err => {res.sendStatus(404)})
})


/* Match Endpoints Begin from here */

// GET /match
// - return all active matches sorted in descending order by prize
// - send 200 response code

app.get('/match', async (req, res) => {
    await player_data.getMatches().then((match) => {
        // console.log(match)
        res.status(200).send(JSON.stringify(match))
    })
})

// GET /match/:mid
// - return 200 and match info if found
// - return 404 is match not found

app.get('/match/:mid', async (req, res) => {
    await player_data.getMatch(req.params.mid).then((match) => {
        res.status(200).send(JSON.stringify(match))
    }).catch((err) => res.sendStatus(404))
})

// POST /match
// - redirect to /match/:mid with 303 if successful
// - 404 if player1 or player2 does not exist
// - 409 is either player is already in an active match
// - 402 if insufficient account balance for either player
// - 400 else

app.post('/match', async (req, res) => {
    let pid1 = req.query?.p1_id
    let pid2 = req.query?.p2_id
    let entry_fee_usd_cents = req.query?.entry_fee_usd_cents
    let prize_usd_cents = req.query?.prize_usd_cents

    let error = false

    if (!Validator._validate_balance(entry_fee_usd_cents)) {
        error = true
    }

    if (!Validator._validate_balance(prize_usd_cents)) {
        error = true
    }

    if (!error) {
        await player_data.createMatch(pid1, pid2,
            Number(entry_fee_usd_cents), Number(prize_usd_cents)).then(
                (result) => {res.redirect(303, `/match/${result}`)}
            ).catch((err) => {
                // console.log(err)
                if (err instanceof kErrors.kNotFoundError) {res.sendStatus(404)}
                else if (err instanceof kErrors.kInActiveMatch) {res.sendStatus(409)}
                else if (err instanceof kErrors.kInsufficientFunds) {res.sendStatus(402)}
                else {res.sendStatus(400)}
            })
    }
    else {
        res.sendStatus(400)
    }
})

// POST /match/:mid/award/:pid
// - 200 if success
// - 404 if player or match does not exist
// - 409 if match not active
// - 400 else

app.post('/match/:mid/award/:pid', async (req, res) => {
    let points = req.query.points
    // Check for valid points
    if (!Validator._validate_positive_integer(points)) {
        res.sendStatus(400)
        return
    }

    if (!Validator._validate_ObjectId(req.params.mid)) {
        res.sendStatus(404)
        return
    }

    if (!Validator._validate_ObjectId(req.params.pid)) {
        res.sendStatus(404)
        return
    }

    await player_data.awardPoints(
        req.params.mid, 
        req.params.pid, 
        Number(points)).
        then((data) => {res.status(200).send(JSON.stringify(data))}).
        catch((err) => {
            // console.log(err)
            if (err instanceof kErrors.kNotFoundError) {
                res.sendStatus(404)
            }
            else if(err instanceof kErrors.kMatchNotActive) {
                res.sendStatus(409)
            }
            else {
                res.sendStatus(400)
            }
        })
})

// POST /match/:mid/end
// - 200 if success
// - 404 if match doesn't exist
// - 409 is match not active or points tied

app.post('/match/:mid/end', async (req, res) => {
    if (!Validator._validate_ObjectId(req.params.mid)) {
        res.sendStatus(404)
        return
    }
    player_data.endMatch(req.params.mid).
    then((data) => {res.status(200).send(JSON.stringify(data))}).
    catch((err) => {
        if (err instanceof kErrors.kNotFoundError) {
            res.sendStatus(404)
        }
        else if (err instanceof kErrors.kMatchNotActive) {
            res.sendStatus(409)
        }
        else {
            res.sendStatus(400)
        }
    })
})

// POST /match/:mid/disqualify/:pid
// - 200 if success
// - 404 if player or match doesn't exist
// - 409 if match not active
// - 400 else

app.post('/match/:mid/disqualify/:pid', async (req, res) => {
    if (!Validator._validate_ObjectId(req.params.mid)) {
        res.sendStatus(404)
        return
    }

    if (!Validator._validate_ObjectId(req.params.pid)) {
        res.sendStatus(404)
        return
    }
    player_data.disqualifyMatch(req.params.mid, req.params.pid).
    then((data) => {res.status(200).send(JSON.stringify(data))}).
    catch((err) => {
        if (err instanceof kErrors.kNotFoundError) {
            res.sendStatus(404)
        }
        else if (err instanceof kErrors.kMatchNotActive) {
            res.sendStatus(409)
        }
        else {
            res.sendStatus(400)
        }
    })
})


// Check if the file is a valid JSON file before starting the server
if (!check_valid_config(MONGO_CONFIG_FILE)) {
    process.exit(2)
}

app.listen(PORT)

// let player_data = new PlayersDatabase()
// player_data.getPlayer('634dfa3a49f24d5c9bae8d7c').then((player)=>console.log('player')).catch(err => console.error(err))