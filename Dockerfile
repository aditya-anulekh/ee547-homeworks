FROM debian:latest

RUN apt-get update && apt-get install -y sudo
RUN sudo apt-get install -y curl

RUN curl -sL https://deb.nodesource.com/setup_18.x | sudo bash -
RUN sudo apt-get update -y
RUN sudo apt-get install -y nodejs
