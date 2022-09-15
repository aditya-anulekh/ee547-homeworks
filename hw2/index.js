`use strict`;

const http = require('http');
const url = require('url');
const fs = require('fs');

const PORT = 8088;

let num_requests = 0;
let num_errors = 0;


function factorial(num) {
    let result = BigInt(1);
    num = BigInt(num);
    while (num > 0) {
        // console.log
        result *= num;
        num -= BigInt(1);
    }
    return result;
}


function countCharacters(characters) {
    let char_map = new Map();
    for (let i=0; i < characters.length; i++) {
        if (char_map.has(characters[i])) {
            char_map.set(characters[i], char_map.get(characters[i])+1);
        }
        else {
            char_map.set(characters[i], 1);
        }
    }
    return char_map;
}


function anagram(characters) {
    characters = characters.toLowerCase();
    let num_characters = characters.length;
    let char_count = countCharacters(characters);
    let numerator = factorial(num_characters);
    let denominator = BigInt(1);
    for (const value of char_count.values()) {
        denominator *= factorial(value);
    }
    console.log(typeof(denominator));
    return BigInt(numerator/denominator);    
}


const server = http.createServer((req, res) => {
    let respBody = '';
    let contentType = 'text/html';
    let httpCode = 404;
    num_requests += 1;

    try {
        switch(req.method.toLocaleLowerCase()) {
            case 'get': 
                console.error(req.url);

                parsed_url = url.parse(req.url, true);

                if (parsed_url.pathname === '/ping') {
                    httpCode = 204;
                }
                else if (parsed_url.pathname === '/anagram') {
                    const alpha_regex = new RegExp('^[a-zA-Z]+$');
                    if (alpha_regex.test(parsed_url.query.p)) {
                        httpCode = 200;
                        let num_anagrams = anagram(parsed_url.query.p);
                        respBody = JSON.stringify({'p':parsed_url.query.p, 'total':num_anagrams.toString()});
                    }
                    else {
                        httpCode = 400;
                    }
                }
                else if (parsed_url.pathname === '/secret') {
                    try {
                        const data = fs.readFileSync('/tmp/secret.key', 'utf8');
                        respBody = data;
                        httpCode = 200;
                    }
                    catch (err) {
                        httpCode = 404;
                        num_errors += 1;
                    }
                }
                else if (parsed_url.pathname === '/status') {
                    let date = new Date();
                    httpCode = 200;
                    respBody = JSON.stringify({
                        'time': date.toISOString().split('.')[0] + 'Z', 
                        'req': num_requests, 
                        'err': num_errors
                    });
                }
                else {
                    httpCode = 404;
                    num_errors += 1;
                }
            break;
        }
    }

    catch (err){
        respBody = `Error ${err.message}`;
        httpCode = 500;
    }

    res.writeHead(httpCode, {'Content-Type': contentType});
    res.write(respBody);
    res.end();
});


server.listen(PORT);

