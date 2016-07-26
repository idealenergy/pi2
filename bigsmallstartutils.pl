#!/usr/bin/perl

# Start BigSmall services that should always be running - this will almost
# always just report that the service(s) is(are) already running.

# Start processes to gather "other forms of data" - namely
# Z-Wave, Open Energy Monitor
my $bigsmallfile = "/home/pi/bigsmall";
my $homefile = "/home/pi/home_id";
my @knownDataProviders = ("zwave","oem");
my %processes = ("zwave" => "./zwave/IDEALzwave/idealoz", "oem" => "./oem_receive.pl");
my $home = `cat ~/home_id`;
my $oem_ip = `cat ~/oem_ip`;
my $oem_api = `cat ~/oem_api`;
my %args = ("zwave" => "-u /dev/ttyACM0 -c /home/pi/pi/env.json -h $home", 
	"oem" => "-i $oem_ip -a $oem_api");

if (-f "$bigsmallfile" && -f "$homefile") {
  for my $datasource (@knownDataProviders) {
    my $commname = $processes{$datasource};
    my $grepfor = $commname; $grepfor =~ s/^.*\///;
    my $exproc = `pgrep -f $grepfor`;
    print "Proc pgrep -f $grepfor\n";
	
    if ($exproc && $exproc!~/^\s*$/) {
      print "Process to receive data from $datasource already running.\n";
    } else {
      my $command = "$commname $args{$datasource}";
      print "execute $command\n";
      system("$command > /dev/null 2>&1 &");
    }
  }
} else {
  print "No files ($bigsmallfile, $homefile)\n";
}
