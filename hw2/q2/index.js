const axios = require('axios');
const {EntityNotFoundError} = require('./error');

function Tweet (body, createdAt, publicMetrics, tweetId, userId) {
    this.body = body;
    this.createdAt = createdAt;
    this.publicMetrics = publicMetrics;
    this.tweetId = tweetId;
    this.userId = userId;
}


function TweetPublicMetrics (retweetCount, replyCount, likeCount) {
    this.retweetCount = retweetCount;
    this.replyCount = replyCount;
    this.likeCount = likeCount;
}

function User(createdAt, description, location, name, publicMetrics, userId, userName, verified) {
    this.createdAt = createdAt;
    this.description = description;
    this.location = location;
    this.name = name;
    this.publicMetrics = publicMetrics;
    this.userId = userId;
    this.userName = userName;
    this.verified = verified;
}


function UserPublicMetrics(followersCount, followingCount, tweetCount) {
    this.followersCount = followersCount;
    this.followingCount = followingCount;
    this.tweetCount = tweetCount;
}



class TwitterApi {
    constructor(bearerToken) {
        this.bearerToken = bearerToken;
    }

    getTweet(tweetId, callback) {
        let request_config = {
            method: 'get',
            url: `https://api.twitter.com/2/tweets/${tweetId}?expansions=author_id&tweet.fields=created_at,public_metrics`,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`
            }
        };

        axios(request_config).then(response => {
            return new Promise((resolve, reject) => {
                if (Object.hasOwn(response.data, 'errors')) {
                    let t = new EntityNotFoundError();
                    reject(t);
                }
                else {
                    let t = new Tweet(
                        response.data.data.text,
                        response.data.data.created_at,
                        new TweetPublicMetrics(
                            response.data.data.public_metrics.retweet_count,
                            response.data.data.public_metrics.reply_count,
                            response.data.data.public_metrics.like_count),
                        response.data.data.id,
                        response.data.data.author_id
                    );
                    resolve(t);
                }
            }).then(data => callback(null, data)).catch(err => callback(err, null))
        }).catch(errors => {
            console.log(errors);
        })
    }

    getTimeline(userId, callback) {
        // Define the request config
        let request_config = {
            method: 'get',
            url: `https://api.twitter.com/2/users/${userId}/tweets?expansions=author_id&tweet.fields=created_at,public_metrics`,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`
            }
        };

        axios(request_config).then(response => {
            // Function to process the output from the API
            // Return a promise
            return new Promise((resolve, reject) => {
                // If the response object has 'errors' key, reject the promise
                if (Object.hasOwn(response.data, 'errors')) {
                    let t = new EntityNotFoundError();
                    reject(t);
                }
                else {
                    let tweets = [];
                    // Check if a timeline exists
                    if (response.data.meta.result_count > 0) {
                        for (const datum of response.data.data) {
                            tweets.push(
                                new Tweet(
                                    datum.text,
                                    datum.created_at,
                                    new TweetPublicMetrics(
                                        datum.public_metrics.retweet_count,
                                        datum.public_metrics.reply_count,
                                        datum.public_metrics.like_count),
                                    datum.id,
                                    datum.author_id
                                )
                            );
                        }
                        resolve(tweets);
                    }
                    resolve(tweets);
                }
            }).then(data => callback(null, data)).catch(err => callback(err, null))
        }).catch(errors => {
            console.log(errors);
        })
    }

    recentSearch(query, callback) {
        // Define the request config
        let request_config = {
            method: 'get',
            url: `https://api.twitter.com/2/tweets/search/recent?expansions=author_id&tweet.fields=created_at,public_metrics&query="${query}"`,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`
            }
        };

        axios(request_config).then(response => {
            // Function to process the output from the API
            // Return a promise
            return new Promise((resolve, reject) => {
                // If the response object has 'errors' key, reject the promise
                if (Object.hasOwn(response.data, 'errors')) {
                    let t = new EntityNotFoundError();
                    reject(t);
                }
                else {
                    let tweets = [];
                    // Check if a timeline exists
                    if (response.data.meta.result_count > 0) {
                        for (const datum of response.data.data) {
                            tweets.push(
                                new Tweet(
                                    datum.text,
                                    datum.created_at,
                                    new TweetPublicMetrics(
                                        datum.public_metrics.retweet_count,
                                        datum.public_metrics.reply_count,
                                        datum.public_metrics.like_count),
                                    datum.id,
                                    datum.author_id
                                )
                            );
                        }
                        resolve(tweets);
                    }
                    resolve(tweets);
                }
            }).then(data => callback(null, data)).catch(err => callback(err, null))
        }).catch(errors => {
            console.log(errors);
        })
    }

    retweetBy(tweetId, callback) {
        let request_config = {
            method: 'get',
            url: `https://api.twitter.com/2/tweets/${tweetId}/retweeted_by?user.fields=created_at,description,id,location,public_metrics,username,verified`,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`
            }
        }

        axios(request_config).then(response => {
            // Function to process the output from the API
            // Return a promise
            return new Promise((resolve, reject) => {
                // If the response object has 'errors' key, reject the promise
                if (Object.hasOwn(response.data, 'errors')) {
                    let t = new EntityNotFoundError();
                    reject(t);
                }
                else {
                    let users = [];
                    // Check if a timeline exists
                    if (response.data.meta.result_count > 0) {
                        for (const datum of response.data.data) {
                            users.push(
                                new User(
                                    datum.created_at,
                                    datum.description,
                                    datum.location,
                                    datum.name,
                                    new UserPublicMetrics(
                                        datum.public_metrics.followers_count,
                                        datum.public_metrics.following_count,
                                        datum.public_metrics.tweet_count),
                                    datum.id,
                                    datum.username,
                                    datum.verified
                                )
                            );
                        }
                        resolve(users);
                    }
                    resolve(users);
                }
            }).then(data => callback(null, data)).catch(err => callback(err, null))
        }).catch(errors => {
            console.log(errors);
        })

    }

    getUser(userId, callback) {
        let request_config = {
            method: 'get',
            url: `https://api.twitter.com/2/users/${userId}?user.fields=created_at,description,id,location,public_metrics,username,verified,name`,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`
            }
        }

        axios(request_config).then(response => {
            return new Promise((resolve, reject) => {
                if (Object.hasOwn(response.data, 'errors')) {
                    let t = new EntityNotFoundError();
                    reject(t);
                }
                else {
                    let t = new User(
                        response.data.data.created_at,
                        response.data.data.description,
                        response.data.data.location,
                        response.data.data.name,
                        new UserPublicMetrics(
                            response.data.data.public_metrics.followers_count,
                            response.data.data.public_metrics.following_count,
                            response.data.data.public_metrics.tweet_count),
                        response.data.data.id,
                        response.data.data.username,
                        response.data.data.verified);
                    resolve(t);
                }
            }).then(data => callback(null, data)).catch(err => callback(err, null))
        }).catch(errors => {
            console.log(errors);
        })


    }

    getUserByUsername(userName, callback) {
        let request_config = {
            method: 'get',
            url: `https://api.twitter.com/2/users/by/username/${userName}?user.fields=created_at,description,id,location,public_metrics,username,verified,name`,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`
            }
        }

        axios(request_config).then(response => {
            return new Promise((resolve, reject) => {
                if (Object.hasOwn(response.data, 'errors')) {
                    let t = new EntityNotFoundError();
                    reject(t);
                }
                else {
                    let t = new User(
                        response.data.data.created_at,
                        response.data.data.description,
                        response.data.data.location,
                        response.data.data.name,
                        new UserPublicMetrics(
                            response.data.data.public_metrics.followers_count,
                            response.data.data.public_metrics.following_count,
                            response.data.data.public_metrics.tweet_count),
                        response.data.data.id,
                        response.data.data.username,
                        response.data.data.verified);
                    resolve(t);
                }
            }).then(data => callback(null, data)).catch(err => callback(err, null))
        }).catch(errors => {
            console.log(errors);
        })


    }

    getTimelineByUsername(userName, callback) {
        this.getUserByUsername(userName, (err, data) => {
            if (!err) {
                return new Promise((resolve, reject) => {
                    this.getTimeline(data.userId, (err, data) => {
                        if (!err) {
                            resolve(data);
                        }
                        else {reject(err);}
                    })
                }).then(data => callback(null, data)).catch(err => callback(err, null));
            }
            else {
                return new Promise((resolve, reject) => {
                    reject(err);
                }).then(data => callback(null, data)).catch(err => callback(err, null));
            }
        }) /*then(data => callback(null, data)).catch(err => callback(err, null))*/;
    }
}

exports.TwitterApi = TwitterApi;
