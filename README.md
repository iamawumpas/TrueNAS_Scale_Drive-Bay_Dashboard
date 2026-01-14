# TrueNAS-Scale-Drive-Bay-Assignment
A dashboard to show my disk array arangement, status and activity
<img width="1907" height="607" alt="image" src="https://github.com/user-attachments/assets/8fd8f566-7136-4d34-9a67-03acb8371222" />


## Instalation
1) SSH into the TrueNAS Scale console

2) You are going to want to install these files on one of your Pools
mkdir -p /mnt/[ Pool Name ]/scripts/disk_lights

3) For testing purposes the script must be run from within the folder
cd /mnt/[ Pool Name ]/scripts/disk_lights

4) Using WINScp or some other file copying software, copy the sensor.py and index.html files to the 'disk_lights' folder.

5) give service.py the following permissions
          chmod +x /mnt/[ Pool Name ]/scripts/disk_lights/service.py 

7) enable the service / manual
   a)  run the service

         nohup python3 /mnt/Data1/apps/disk_lights/service.py > /dev/null 2>&1 &
      
   All going well you should get a response like this
   [1] 3321474

   b) Check that that the service is actually running.

         ps aux | grep service.py

   You should see something like:
   root     3321474  1.5  0.1  99764 16504 pts/12   SNl  17:29   0:01 python3 service.py
   root     3321762  0.0  0.0   3880  1344 pts/12   S+   17:30   0:00 grep service.py

   The first entry shows that the service is running, the second shows that that the 'ps aux | grep service.py' has executed. If you only see the second command then the service has failed to run for 
   some reason.

   c) If you need to stop the service, run

         pkill -9 -f service.py



7) Create the Init Script: In the TrueNAS Web UI
    go to System Settings > Advanced > Init/Shutdown Scripts.
    Click **Add**.
    **Description:** Disk Light Service
    **Type:** Script
    **Script:** python3 /mnt/[ Pool Name]/scripts/disk_lights/service.py
    **When:** Post Init
    **Save.**


## What do the files do?
*service.py* 
this is the daemon that will interrogate TrueNAS and your HBA to identify 
- the number of used ports,
- the serial number of each disk (for identification purposes),
- the slot number on each breakout cable (see **Logic**),
- the disk capacity,
- the drive status,
- and read/write activity.

It is also a very basic html server which will serve the data to what ever browser you are using to see the dashboard.

*index.html*
this is the HTML (and embedded CSS) needed to view the dashboard.
Currently it is not interctive, so you canoot chnge the drive bay order. 


## Logic
The logic assumes the following:
- that there are 4 possible ports on the HBA (this is my HBA afterall)
- each breakout cable has 4 SATA breakout cables on it

   Port 1 - SATA 1-4      Port 2 - SATA 5-8      Port 3 - SATA 9-12      Port 4 - SATA 13-16

- the drives are physically in the order displayed since the HBA-to-SATA cables are arranged this way. As there is no backplane currently implemented in my set up, the HBA cannot report the actual connections. To chnage the order of the drives displyed, change the SARA connector plugged into the drive.

