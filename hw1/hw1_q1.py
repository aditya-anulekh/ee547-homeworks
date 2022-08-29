import sys


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


# def count_anagram(characters):
#     # convert characters to lowercase
#     characters = characters.lower()
#     result = []
#     current_result = []
#     count_anagram_helper(characters, result, current_result)
#     return len(result), result
#
#
# def count_anagram_helper(characters, result, current_result):
#     # Check if you are at the leaf node - implying that we reached the max number of available characters
#     if len(current_result) == len(characters):
#         result.append(current_result)
#         return
#
#     # Iterate through all the characters
#     for char in characters:
#         # If the character is already in the permutation generated, skip
#         if char in current_result:
#             continue
#
#         # Else add the character to the existing list
#         next_current_result = [i for i in current_result]
#         next_current_result.append(char)
#         # Call the function recursively to generate further permutations
#         count_anagram_helper(characters, result, next_current_result)
#     return


if __name__ == "__main__":
    args = sys.argv

    if len(args) != 2:
        sys.stderr.write("invalid\n")
        sys.exit()
    else:
        # print(f"Word: {args[1]}")
        # Only alphabets are allowed as the input
        if args[1].isalpha():
            # num_anagrams, _ = count_anagram(args[1])
            num_anagrams = count_anagram_factorial(args[1])
            sys.stdout.write(f"{num_anagrams}\n")
        # Check the length of the string otherwise
        else:
            # If the length of the string is 0, write "empty" to stdout
            if len(args[1]) == 0:
                sys.stdout.write("empty\n")
                sys.exit()
            # Else write "invalid" to stderr
            else:
                sys.stderr.write("invalid\n")
                sys.exit()
