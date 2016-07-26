#!/usr/bin/perl

# Grab data from the local-networked emon-pi or emon-base. 
# Requires both API key for emonCMS and IP of the Pi:
# perl ./oem_receive.pl -a 4e7e7b31eb6b3e911e65e7d81ee417d5 -i '129.215.90.176'

use lib qw(..);
use JSON qw( );

my $ip = "";
my $apikey = "";
my $DEFAULT_API_KEY = "ec81b582b92412d0938005fe14c263a6";
my $JSON = "/home/pi/pi/env.json";
my $ENVVAR = "NODE_ENV";
my $select = $ENV{$ENVVAR} || "development";
my $HOMEFILE = "/home/pi/home_id";
my $HOME = `cat $HOMEFILE`;
$HOME=~s/[\s\n]//g;

print STDERR "\n\nNODE_ENV is $select\n\n";

sub usage {
    print STDERR "Usage: oem_recieve.pl -a apikey -i IP_address\n";
    exit 1;
}

if (scalar @ARGV>4 || scalar @ARGV<2) {
    print "Incorrect number of arguments: ".scalar @ARGV."\n";
    &usage;
}

while (@ARGV) {
    my $arg = shift (@ARGV);
    if ($arg eq "-a") {
	$apikey = shift(@ARGV);
	if (!$apikey) { &usage; }
    } elsif ($arg eq "-i") {
	$ip = shift(@ARGV);
	if (!$ip) { &usage; }
    } else {
	&usage;
    }
}

if (!$apikey) {
  $apikey=$DEFAULT_API_KEY;
}

if (!$ip) {
    &usage;
}

my $json_text = do {
   open(my $json_fh, "<:encoding(UTF-8)", $JSON)
      or die("Can't open \$JSON\": $!\n");
   local $/;
   <$json_fh>
};

my $json = JSON->new;
my $data = $json->decode($json_text);

sub retrieveval() {
    my ($index) = @_;
    #my $command = "curl http://$ip/emoncms/nodes/8/rx/$index?apikey=$apikey 2> /dev/null";
    my $command = "curl 'http://$ip/emoncms/feed/value.json\?id=$index\&apikey=$apikey' 2> /dev/null";
    print " HELLO: $command\n";
    my $res = `$command`;
    print "  THERE: $res\n";
    if ($res=~/^\"([\d.]*)\"/) {
	return $res;
    }
#    if ($res=~/\"value\":([^,]*)/) { 
#	return $1;
#    }
    return 0;
}

sub retrievevals() {
    my ($fetches) = @_;
    #my $command = "curl http://$ip/emoncms/nodes/8/rx/$index?apikey=$apikey 2> /dev/null";
    my $command = "curl 'http://$ip/emoncms/feed/fetch.json\?ids=$fetches\&apikey=$apikey' 2> /dev/null";
    print " HELLO: $command\n";
    my $res = `$command`;
    print "  THERE: $res\n";
    return $res;
}

sub sendval() {
    my ($vals) = @_;
    my $selected = $data->{$select};
    my $time = time;
    my $valres = $json->decode($vals);
    my $jsonstring="\"home_id\":$HOME,\"timestamp\":$time";
    if ($selected) {
	for (my $i=0; $i<4; $i++) {
	    my $j=$i+1;
	    $jsonstring.=",\"power$j\":$valres->[$i]";
	}
        my $command = "curl -i -X POST -H 'Content-Type: application/json' -d '{$jsonstring}' $selected->{IDEALServer}oemreading";
	print "$command\n";
	print `$command`;
    }
}

# First grab all feeds that we can see and use the feed names to decide which ones to fetch
my $command = "curl 'http://$ip/emoncms/feed/list.json\?apikey=$apikey' 2> /dev/null";
print " H1: $command\n";
my $res = $json->decode(`$command`);
my $fetchstring="";
my $size=scalar(@{$res});
my %emon=();
for (my $f=0; $f<$size; $f++) {
   my $id = $res->[$f]{"id"};
   my $name = $res->[$f]{"name"};
   # We're interested in anything of the form node:emontx3:powern
   if ($name=~/node:emontx3:power(\d)/) {
     my $emonindex = $1;
     $emon{$emonindex}=$id;
   }	
}
foreach $e (sort keys %emon) {
  if ($emon{$e}) {
    if ($fetchstring) { $fetchstring.=","; }
    $fetchstring.= $emon{$e};
  } 
}

print "Fetch these: " . $fetchstring . ".\n";
if (!$fetchstring) {
   print "ERROR: No feeds defined or API key incorrect!! Cannot retrieve any values: quitting\n";
   exit 1;
}

while (true) {
    my $vals=&retrievevals($fetchstring);
#    for (my $i=0; $i<5; $i++) {
#	$vals[$i]=&retrieveval($i+2);
#    }
    &sendval($vals);
    sleep 5;
}

