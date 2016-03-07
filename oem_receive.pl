#!/usr/bin/perl

# Grab data from the local-networked emon-pi or emon-base. 
# Requires both API key for emonCMS and IP of the Pi:
# perl ./oem_receive.pl -a 4e7e7b31eb6b3e911e65e7d81ee417d5 -i '129.215.90.176'

use lib qw(..);
use JSON qw( );

my $ip = "";
my $apikey = "";
my $JSON = "/home/pi/pi/env.json";
my $select = $ENV{$ENVVAR} || "development";
my $HOMEFILE = "/home/pi/home_id";
my $HOME = `cat $HOMEFILE`;
my $ENVVAR = "NODE_ENV";
$HOME=~s/[\s\n]//g;

sub usage {
    print STDERR "Usage: oem_recieve.pl -a apikey -i IP_address in_dir\n";
    exit 1;
}

if (scalar @ARGV != 4) {
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

if (!$ip || !$apikey) {
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
    my $command = "curl http://$ip/emoncms/nodes/8/rx/$index?apikey=$apikey 2> /dev/null";
    my $res = `$command`;
    if ($res=~/\"value\":([^,]*)/) { 
	return $1;
    }
    return 0;
}

sub sendval() {
    my (@vals) = @_;
    my $selected = $data->{$select};
    my $time = time;
    my $jsonstring="\"home_id\":$HOME,\"timestamp\":$time";
    if ($selected) {
	for (my $i=0; $i<4; $i++) {
	    my $j=$i+1;
	    $jsonstring.=",\"power$j\":$vals[$i]";
	}
        my $command = "curl -i -X POST -H 'Content-Type: application/json' -d '{$jsonstring}' $selected->{IDEALServer}oemreading";
	print "$command\n";
	print `$command`;
    }
}

while (true) {
    my @vals=();
    for (my $i=0; $i<4; $i++) {
	$vals[$i]=&retrieveval($i+1);
    }
    &sendval(@vals);
    sleep 2;
}

