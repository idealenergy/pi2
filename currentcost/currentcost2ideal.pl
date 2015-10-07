#!/usr/bin/perl

use JSON::Parse 'json_file_to_perl';
use Time::HiRes qw(gettimeofday);

my $preffile = "../env.json";
my $env = (defined $ENV{"NODE_ENV"}) ? $ENV{"NODE_ENV"} : "development";
my %p = %{json_file_to_perl ($preffile)};
my $httptarget = $p{$env}{"IDEALServer"};

while (<>) {
  if (/<watts>([^<]*)<\/watts/) {
     my $whats = $1+0;
     my $t = int(gettimeofday*10);
     $command = "curl -i -X POST -H 'Content-Type: application/json' -d '{\"home_id\":95,\"sensorbox_address\":1,\"timestamp\":$t,\"timeinterval\":60, \"current\":$whats}' $httptarget\jsonreading";
     `$command`;
  } 
}
