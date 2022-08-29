import os
import json
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs

num_requests = 0
errs = 0


def factorial(num):
    """
    Compute the factorial of a given number
    :param num: int
    :return: int
    """
    assert type(num) == int, "Only integer input accepted"
    result = 1
    while num >= 1:
        result *= num
        num -= 1
    return result


def prod(num_list):
    """
    Compute the product of the input iterable
    :param num_list: iterable
    :return: int
    """
    result = 1
    for i in num_list:
        result *= i
    return result


def count_anagram_factorial(characters):
    """
    Count the number of anagrams of a given input
    Formula: (Number of Characters)!/x_1!*x_2!...
    where x_1, x_2 are the number of times each character repeats
    :param characters: str
    :return: int
    """
    characters = characters.lower()
    counts = {char: characters.count(char) for char in characters}
    return int(factorial(len(characters)) / prod([factorial(i) for i in counts.values()]))


class MyHTTPRequestHandler(BaseHTTPRequestHandler):
    # def __init__(self, *args, **kwargs):
    #     print("Initialized Server")
    #     self.num_requests = 0
    #     self.errs = 0
    #     super(self.__class__, self).__init__(*args, **kwargs)

    def do_GET(self):
        global num_requests
        global errs
        num_requests += 1
        path, _, query_string = self.path.partition("?")
        query = parse_qs(query_string)
        # Respond with 204 at /ping
        if path == "/ping":
            self.send_response(204)
            self.end_headers()
        # Fetch the parameter and count the number of anagrams of the input word
        elif path == "/anagram":
            characters = query.get("p")
            if characters is not None:
                characters = characters[0]
                if len(characters) == 0 or not characters.isalpha():
                    self.send_response(400)
                    self.end_headers()
                else:
                    num_anagrams = count_anagram_factorial(characters)
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(json.dumps(
                        {"p": characters,
                         "total": str(num_anagrams)}
                    ).encode())
            else:
                self.send_response(400)
                self.end_headers()
        # Check if /tmp/secret.key exists and return the response accordingly
        elif path == "/secret":
            if os.path.exists("/tmp/secret.key"):
                with open("/tmp/secret.key", "r") as file:
                    secret_contents = file.read()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(f"{secret_contents}".encode())
            else:
                self.send_response(404)
                self.end_headers()
                errs += 1
        # Return server stats and status
        elif path == "/status":
            status_dict = {
                "time": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "req": str(num_requests),
                "err": str(errs)
            }
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(status_dict).encode())
        # Return 404 for any other paths
        else:
            self.send_response(404)
            self.end_headers()
            errs += 1


if __name__ == "__main__":
    httpd = HTTPServer(('', 8088), MyHTTPRequestHandler)
    httpd.serve_forever()
