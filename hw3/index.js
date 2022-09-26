`use strict`

const fs = require('fs');
const express = require('express');

let PORT = 3000;
let DATA_DIR = './data'
let DATA_FILE = `${DATA_DIR}/player.json`
let MAX_PID = 0

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


class PlayerSourceJson{
    constructor(file) {
        this.file = file;
        let timestamp = new Date()
        this.data = {
            players: [],
            updated_at: timestamp,
            created_at: timestamp,
            version: "1.0"
        }

        if (!(fs.existsSync(DATA_DIR))) {
            fs.mkdirSync(DATA_DIR)            
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 4))
        }
        else {
            if (!(fs.existsSync(DATA_FILE))) {
                fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 4))
            }
            else {
                this.data = JSON.parse(fs.readFileSync(this.file))
            }
        }
    }

    getPlayer(pid) {
        let index = this.data.players.findIndex((obj=>obj.pid == pid))
        return index >= 0 ? this.data.players[index] : null
    }

    createPlayer(fname, lname, handed, initial_balance) {
        // Player ID will be 1 more than the current maximum
        let pid = MAX_PID + 1;
        MAX_PID += 1;

        // Push the new player into the list
        this.data.players.push({
            "pid": pid,
            "fname": fname,
            "lname": lname,
            "handed": handed,
            "is_active": true,
            "balance_usd": Number(initial_balance).toFixed(2)
        })

        // Write file back
        this._updateDb();
        return pid
    }

    updatePlayer(pid, lname, is_active, deposit_value) {
        let index = this.data.players.findIndex((obj=>obj.pid == pid))

        if (index >= 0) {
            let player = this.data.players[index]
            this.data.players[index] = {
                "pid": player.pid,
                "fname": player.fname,
                "lname": lname == null ? player.lname : lname,
                "handed": player.handed,
                "is_active": is_active == null ? player.is_active : is_active,
                "balance_usd": (Number(player.balance_usd) + (deposit_value > 0 ? deposit_value : 0)).toFixed(2)
            }
        }
        else {
            return null
        }

        this._updateDb()
        return pid
    }

    deletePlayer(pid) {
        let index = this.data.players.findIndex((obj=>obj.pid == pid))

        if (index >= 0) {
            this.data.players.splice(index, 1)
        }
        else {
            return null
        }

        this._updateDb()
        return pid

    }

    getBalance(pid) {
        let index = this.data.players.findIndex((obj=>obj.pid == pid))
        return index >= 0 ? this.data.players[index].balance_usd : null
    }

    getPlayers() {
        let players = this._formatPlayer(this.data.players)
        return players.sort((a, b) => {
            if (a.name < b.name){
                return -1
            }
            if (a.name > b.name) {
                return 1
            }

            return 0
        })
    }

    _updateDb() {
        let timestamp = new Date()
        this.data.updated_at = timestamp
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 4))
    }

    _formatPlayer(player) {
        if (player == null) {
            return null
        }

        if (Array.isArray(player)) {
            return player.map(this._formatPlayer)
        }
        
        let return_dict = {
            pid: player.pid,
            name: `${player.fname}${player.lname ? ` ${player.lname}`:''}`,
            // name: "player last",
            handed: handed_enum_r[player.handed],
            is_active: player.is_active,
            balance_usd: player.balance_usd
        }

        return return_dict
    }

    _formatPlayerBalance() {

    }
}


// app.use('/player/:pid', (req, res, next) => {
//     if (req.method.toLowerCase() == "post") {
//         console.error(req.originalUrl)
//         console.error(req.query.lname)
//     }
//     next()
// })


app.get('/ping', (req, res) => {
    res.sendStatus(204);
})


app.get('/player', (req, res) => {
    let player_data = new PlayerSourceJson(DATA_FILE)
    let players = player_data.getPlayers()
    res.status(200).send(JSON.stringify(players))
})


app.get('/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(DATA_FILE)
    let player = player_data._formatPlayer(player_data.getPlayer(req.params.pid))
    if (player == null) {
        res.sendStatus(404)
        return
    }
    res.status(200).send(JSON.stringify(player));
})


app.delete('/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(DATA_FILE)
    let delete_status = player_data.deletePlayer(req.params.pid)
    if (delete_status){
        res.redirect(303, '/player')
        return
    }
    res.sendStatus(404)
})


app.post('/player', (req, res) => {
    let player_data = new PlayerSourceJson(DATA_FILE)
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
        let pid =  player_data.createPlayer(fname, lname, handed_enum[handed.toLowerCase()], initial_balance_usd)
        res.redirect(303, `/player/${pid}`)

    }
    else {
        res.status(422).send(resBody)
    }
})


app.post('/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(DATA_FILE)
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
        let pid = player_data.updatePlayer(req.params.pid, lname, is_active, null)
        if (pid) {
            res.redirect(303, `/player/${pid}`)
        }
        else {
            res.sendStatus(404)
        }
    }
    else {
        res.sendStatus(422)
    }

})


app.post('/deposit/player/:pid', (req, res) => {
    let player_data = new PlayerSourceJson(DATA_FILE)
    deposit_value = req.query?.amount_usd
    let pid = req.params.pid
    
    if (isNaN(Number(deposit_value)) || 
        Number(deposit_value) < 0 || 
        Number(deposit_value) != Number(Number(deposit_value).toFixed(2))) {
        res.sendStatus(400)
        return
    }

    player = player_data.getPlayer(pid)

    if (player) {
        let update_status = player_data.updatePlayer(pid, null, null, Number(deposit_value))
        if (update_status) {
            res.status(200).send(JSON.stringify({
                old_balance_usd: player.balance_usd,
                new_balance_usd: player_data.getPlayer(pid).balance_usd
            }))
        }
    }
    else {
        res.sendStatus(404)
    }


})

app.listen(PORT, ()=>{})