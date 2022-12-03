'use strict'

const express = require('express')
const { graphqlHTTP } = require('express-graphql')
const DataLoader = require('dataloader')
const { readFileSync } = require('fs')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { MongoClient, ObjectId } = require('mongodb')

const app = express()
const PORT = 3000
const MONGO_CONFIG_FILE = './config/mongo.json'
// const typeDefs = readFileSync('./schema-v2.graphql').toString('utf-8')

const typeDefs = `
type Query {
    player(pid: ID!): Player
  
    players(
      limit:  Int
      offset: Int
      sort:   String 
    ): [Player]!
  
    match(mid:    ID!): Match
  
    matches(
      limit:  Int
      offset: Int
      sort:   String 
    ): [Match]!
  }
  
  type Mutation {
    matchAward(
      mid:    ID!
      pid:    ID!
      points: Int!
    ): Match
  
    matchCreate(
      pid1:                ID!
      pid2:                ID!
      entry_fee_usd_cents: Int!
      prize_usd_cents:     Int!
    ): Match
  
    matchDisqualify(
      mid: ID!
      pid: ID!
    ): Match
  
    matchEnd(
      mid: ID!
    ): Match
  
    playerCreate(
      playerInput: PlayerCreateInput
    ): Player
  
    playerDelete(pid: ID!): Boolean
  
    playerDeposit(
      pid:              ID!
      amount_usd_cents: Int!
    ): Player
  
    playerUpdate(
      pid:         ID!
      playerInput: PlayerUpdateInput
    ): Player
  }
  
  enum HandedEnum {
    ambi
    left
    right
  }
  
  input PlayerCreateInput {
    fname:                     String!
    handed:                    HandedEnum
    initial_balance_usd_cents: Int!
    lname:                     String
  }
  
  input PlayerUpdateInput {
    is_active: Boolean
    lname:     String
  }
  
  
  type Player {
    balance_usd_cents:     Int
    efficiency:            Float
    fname:                 String
    handed:                HandedEnum
    in_active_match:       Match
    is_active:             Boolean
    lname:                 String
    name:                  String
    num_dq:                Int
    num_join:              Int
    num_won:               Int
    pid:                   ID!
    total_points:          Int
    total_prize_usd_cents: Int
  }
  
  type Match {
    age:                 Int
    ended_at:            String
    entry_fee_usd_cents: Int
    is_active:           Boolean
    is_dq:               Boolean
    mid:                 ID!
    p1:                  Player!
    p1_points:           Int
    p2:                  Player!
    p2_points:           Int
    prize_usd_cents:     Int
    winner:              Player
  }
`

const handed_enum = {
    'left': 'L',
    'right': 'R',
    'ambi': 'A'
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

// Check if the file is a valid JSON file before starting the server
// if (!check_valid_config(MONGO_CONFIG_FILE)) {
//     process.exit(2)
// }

let config = {
    "host": "mongodb",
    "port": "27017",
    "db": "ee547_hw",
    "opts": {
        "useUnifiedTopology": true
    },
    "player_collection": "player",
    "match_collection": "match"
}

try {
    let conf = require(MONGO_CONFIG_FILE)
    config = {...conf, ...config}
}
catch{}


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

class Decorator{
    static decorate_name(fname, lname) {
        return `${fname}${lname ? ` ${lname}`:''}`
    }

    static decorate_handed(handed) {
        let handed_enum_r = {
            'L': 'left',
            'R': 'right',
            'A': 'ambi'
        }
        return handed_enum_r[handed]
    }

    static format_player(player) {
        if (player == null) {
            return null
        }

        // Check if input is an array
        if (Array.isArray(player)) {
            return player.map(Decorator.format_player)
        }
        else {
            let return_dict = {
                pid: player._id,
                fname: player.fname,
                lname: player.lname,
                name: Decorator.decorate_name(player.fname, player.lname),
                handed: Decorator.decorate_handed(player.handed),
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

    static format_match(match) {
        if (match == null) {
            return null
        }

        if (Array.isArray(match)) {
            return Promise.all(match.map(Decorator.format_match, this))
        }
        else {
            let return_dict = Promise.all([
                client.db.collection(config.player_collection).findOne({_id:ObjectId(match.p1_id)}),
                client.db.collection(config.player_collection).findOne({_id:ObjectId(match.p2_id)})
            ]).then((vals) => {
                return_dict = {
                    age: Math.floor((new Date() - match.created_at)/1000),
                    ended_at: match?.ended_at ? match.ended_at : null,
                    entry_fee_usd_cents: match.entry_fee_usd_cents,
                    is_active: match?.ended_at == null ? true:false,
                    is_dq: match?.is_dq ? match.is_dq : false,
                    mid: match._id,
                    p1: vals[0],
                    p1_points: match?.p1_points ? match.p1_points : 0,
                    p2: vals[1],
                    p2_points: match?.p2_points ? match.p2_points : 0,
                    prize_usd_cents: match.prize_usd_cents,
                    winner: match?.ended_at ? (match.winner_pid == vals[0].p1_id ? vals[0] : vals[1]) : null
                }
                return return_dict
            })
            return return_dict
        }
    }
}

const resolvers = {
    Query: {
        player: async (_, {pid}, context) => {
            // Return the player object from dataloaders
            return context.loaders.player.load(pid)
        },

        players: async (_, {limit, offset, sort}, context) => {
            // Fetch all documents that match the keys
            let players = await context.db.collection(config.player_collection).find({}).toArray()

            // Decorate the player object in the return format
            players = Decorator.format_player(players)

            return players
        },

        match: async (_, {mid}, context) => {
            // Return the match object from dataloaders
            return context.loaders.match.load(mid)
        },

        matches: async (_, {limit, offset, sort}, context) => {
            let result = [];
            let active_matches = [];
            let ended_matches = [];
            try {
                active_matches = await context.db.collection(config.match_collection).find({ended_at:null}).toArray()
                if (active_matches.length > 0) {
                    active_matches = await Decorator.format_match(active_matches)
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
    
                ended_matches = await context.db.collection(config.match_collection).find({ended_at:{$ne:null}}).toArray()
                if (ended_matches.length > 0) {
                    ended_matches = await Decorator.format_match(ended_matches)
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
    },

    Mutation: {
        playerCreate: async (_, {playerInput:{fname, lname, handed, initial_balance_usd_cents}}, context) => {
            let player = {
                fname:fname,
                lname:lname,
                handed:handed_enum[handed.toLowerCase()],
                is_active:true,
                balance_usd_cents:initial_balance_usd_cents,
                created_at:new Date(),
            }
            let result = await context.db.collection(config.player_collection).insertOne(player)
            return Decorator.format_player(player)
        },

        playerDelete: async (_, {pid}, context) => {
            let result = await context.db.collection(config.player_collection).deleteOne({_id:ObjectId(pid)})
            if (!result) {
                return false
            }
            else if (result.deletedCount > 0) {
                context.loaders.player.clear(pid)
                return true
            }
            else {
                return false
            }
        },

        playerUpdate: async (_, {pid, playerInput: {lname, is_active}}, context) => {
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
                result = await context.db.collection(config.player_collection).updateOne({'_id':ObjectId(pid)}, update_dict)
                if (result.matchedCount > 0) {
                    context.loaders.player.clear(pid)
                    return context.loaders.player.load(pid)
                }
                else {
                    throw new kErrors.kNotFoundError()
                }
            }
            finally {}
        },

        playerDeposit: async (_, {pid, amount_usd_cents}, context) => {
            let result;
    
            // Create a dictionary to store the updates to be made to the object
            // Set only the keys that have to be updated
            let update_dict = {$inc:{balance_usd_cents:amount_usd_cents}}
    
            try {
                result = await context.db.collection(config.player_collection).updateOne({'_id':ObjectId(pid)}, update_dict)
                if (result.matchedCount > 0) {
                    deposited = true
                    context.loaders.player.clear(pid)
                    return context.loaders.player.load(pid)
                }
                else {
                    throw new kErrors.kNotFoundError()
                }
            }
            finally {}
        },

        matchCreate: async (_, {pid1, pid2, entry_fee_usd_cents, prize_usd_cents}, context) => {
            let result;
            let player1
            let player2;
            // Check if the players exist
            try {
                player1 = await context.db.collection(config.player_collection).findOne({_id:ObjectId(pid1)})
                player2 = await context.db.collection(config.player_collection).findOne({_id:ObjectId(pid2)})
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
                result = await context.db.collection(config.match_collection).insertOne(match)
    
                // Update player's balance and match ID
                let update_dict = {
                    $inc:{balance_usd_cents:-1*match.entry_fee_usd_cents, num_join:1},
                    $set:{in_active_match:result.insertedId}
                }
    
                await context.db.collection(config.player_collection).updateOne({_id:ObjectId(match.p1_id)}, update_dict)
                await context.db.collection(config.player_collection).updateOne({_id:ObjectId(match.p2_id)}, update_dict)
                
                return Decorator.format_match(match)
            }
            finally{}
        },

        matchAward: async (_, {mid, pid, points}, context) => {
            let player;
            let match;
    
            try {
                player = await context.db.collection(config.player_collection).findOne({_id:ObjectId(pid)})
    
                match = await context.db.collection(config.match_collection).findOne({_id:ObjectId(mid)})
    
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
                await context.db.collection(config.match_collection).updateOne({_id:ObjectId(mid)}, match_update)
    
                // Update player
                await context.db.collection(config.player_collection).updateOne({_id:ObjectId(pid)}, player_update)

                context.loaders.match.clear(mid)
                context.loaders.player.clear(pid)
                return context.loaders.match.load(mid)
            }
            finally{}
        },

        matchDisqualify: async (_, {mid, pid}, context) => {
            let match;
            let player;
            try {
                match = await context.db.collection(config.match_collection).findOne({_id:ObjectId(mid)})
                player = await context.db.collection(config.player_collection).findOne({_id:ObjectId(pid)})
    
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
                await context.db.collection(config.match_collection).updateOne({_id:ObjectId(mid)}, match_update)
    
                // Update all the players in the match
                await context.db.collection(config.player_collection).updateMany({in_active_match:ObjectId(mid)}, player_update)
    
                // Update the winner
                await context.db.collection(config.player_collection).updateOne({_id:ObjectId(winner_pid)}, winner_update)
    
                // Update the disqualified player
                await context.db.collection(config.player_collection).updateOne({_id:ObjectId(pid)}, dq_update)

                context.loaders.match.clear(mid)
                context.loaders.player.clear(pid),
                context.loaders.player.clear(winner_pid)
                return context.loaders.match.load(mid)
            }   
            finally{}
        },

        matchEnd: async (_, {mid}, context) => {
            let match;
            try {
                match = await context.db.collection(config.match_collection).findOne({_id:ObjectId(mid)})
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
                await context.db.collection(config.match_collection).updateOne({_id:ObjectId(mid)}, match_update)
    
                // Update all the players in the match
                await context.db.collection(config.player_collection).updateMany({in_active_match:ObjectId(mid)}, player_update)
    
                // Update the winner
                await context.db.collection(config.player_collection).updateOne({_id:ObjectId(winner_pid)}, winner_update)

                context.loaders.match.clear(mid)
                return context.loaders.match.load(mid)
            }
            finally {}
        }

    },
    Player: {
        balance_usd_cents: ({balance_usd_cents}, _, context) => {
            return balance_usd_cents;
        },

        efficiency: ({efficiency}, _, context) => {
            return efficiency
        }
    }
}

const schema = makeExecutableSchema({
    resolvers,
    resolverValidationOptions: {
        requireResolversForAllFields: 'ignore',
        requireResolversToMatchSchema: 'ignore'
    },
    typeDefs
})

let client = (async function() {
    let mongo_uri = `mongodb://${config.host}:${config.port}`

    let client = new MongoClient(mongo_uri, config.opts)

    await client.connect()

    return client
})();


// GET /ping
// - Empty body
// - status - 204

app.get('/ping', (req, res) => {
    res.sendStatus(204);
})


app.use('/graphql', graphqlHTTP(async (req, res) => {
    let db = (await client).db('ee547_hw')
    return {
        schema,
        graphiql: true,
        context: {
            db: db,
            loaders: {
                player: new DataLoader(keys => getPlayers(db, keys)),
                match:  new DataLoader(keys => getMatches(db, keys)),
            }
        }
    };
}));


async function getPlayers(db, keys) {
    // Convert keys to ObjectID type
    keys = keys.map(key => ObjectId(key))

    // Fetch all documents that match the keys
    let players = await db.collection('player').find({_id: {$in: keys}}).toArray()

    // Decorate the player object in the return format
    players = Decorator.format_player(players)

    // Return the objects for which keys are found. Else throw error
    return keys.map(key => 
        players.find(element => element.pid == key.toString()) 
        || new Error(`Player ${key} doesn't exist`))
}


async function getMatches(db, keys) {
    // Convert keys to ObjectID type
    keys = keys.map(key => ObjectId(key))

    // Fetch all documents that match the keys
    let matches = await db.collection('match').find({_id: {$in: keys}}).toArray()

    // Decorate the player object in the return format
    matches = Decorator.format_match(matches)

    // Return the objects for which keys are found. Else throw error
    return keys.map(key => 
        matches.find(element => element.pid == key.toString()) 
        || new Error(`Match ${key} doesn't exist`))
}


app.listen(PORT)
