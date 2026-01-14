# TrueNAS-Scale-Drive-Bay-Assignment
A dashboard to show my disk array arangement, status and activity. 
<img width="1908" height="483" alt="image" src="https://github.com/user-attachments/assets/2700a1bc-75f2-4fb2-825d-8c9a03b3310c" />

&emsp;
&emsp;
## Why?
- I don't have a disk storage chassis.
- TrueNAS Scale (Community Edition) does not have a dashboard widget that shows drive status
- Tracing which drive is having a problem in TrueNAS is a long and involved process (OK I am lazy)
- I like blinky lights.
- My home lab is just that.....a lab. There are wires everywhere and the whole system is cobbled together from old PCs. servers, and so-forth. I like to play, rather than have everything perfect.....and then there's the whole $$$ thing. If I could afford a 45 Drives Storinator or even a secondhand disk store chasis I would be using it, but then again I would still want the blinky light.... I am Gen X afterall.
&emsp;
&emsp;
## What Does It Do?
As the above image shows, this wee script generates a virtual Drive Storage Chassis. It shows:
- the arrangement of the physical drives (as detected by the HBA and which cables are attached to the drives - I do not have a backplane)
- the formatted Drive Capacity | the last 3 digits of the drive serial number (I label my disks with the last 3 digits of their serial number to make it easy to trace faulty drives)
- Drive read/write activity - Blue blinky LED
- Drive status
  - Green LED = Drive is connected and functioning normally
  - Orange LED = Drive is connected, but some errors are reported by TrueNAS Scale
  - White LED = Drive is connected, it is being resilvered
  - Red LED = Drive is connected, but offline according to TrueNAS Scale
  - Purple LED = Drive is connected, but is a spare or not currently allocated
&emsp;
&emsp;
## Instalation
1) SSH into the TrueNAS Scale console

2) You are going to want to install these files on one of your Pools

             mkdir -p /mnt/[ Pool Name ]/scripts/disk_lights

4) For testing purposes the script must be run from within the folder

          cd /mnt/[ Pool Name ]/scripts/disk_lights

5) Using WinSCP or some other file copying software, copy the sensor.py and index.html files to the 'disk_lights' folder.

6) give service.py permission to execute (not strictly necessary, but good practice).

         chmod +x /mnt/[ Pool Name ]/scripts/disk_lights/service.py 

8) enable the service / manually run the service.
   
   a) start the service

         nohup python3 service.py > /dev/null 2>&1 &
      
      All going well, you should get a response like this
      [1] 3321474


   b) Check that that the service is actually running.

         ps aux | grep service.py

      You should see something like:
   &emsp;
   &emsp;root     3321474  1.5  0.1  99764 16504 pts/12   SNl  17:29   0:01 python3 service.py
&emsp;
   &emsp;root     3321762  0.0  0.0   3880  1344 pts/12   S+   17:30   0:00 grep service.py
&emsp;
&emsp;
   The first entry shows that the service is running, the second shows that that the *ps aux | grep service.py* has executed. If you only see the second entry, then the service has failed to run for 
   some reason.
&emsp;
&emsp;
   c) If you need to stop the service, run

         pkill -9 -f service.py
&emsp;
&emsp;
7) Create the Init Script: In the TrueNAS Web UI
   go to **System Settings > Advanced > Init/Shutdown Scripts**.

   Click **Add**.

   **Description:** Disk Light Service

   **Type:** Script

   **Script:** python3 /mnt/[ Pool Name]/scripts/disk_lights/service.py

   **When:** Post Init

   **Save.**
&emsp;
&emsp;
## What do the files do?
*service.py* 
this is the daemon that will interrogate TrueNAS and your HBA to identify 
- the number of used ports,
- the serial number of each disk (for identification purposes),
- the slot number on each breakout cable (see **Logic**),
- the [formatted] disk capacity, not the vdev capacity
- the drive status as reported by TrueNAS,
- and read/write activity.
&emsp;
It is also a very basic web server which will serve the data to what ever browser you are using to see the dashboard. It uses port 8010 be default, but you can change this in the script.
&emsp;
*index.html*
this is the HTML (and embedded CSS) needed to view the dashboard.
Currently it is not interctive, so you canoot chnge the drive bay order. 
&emsp;
&emsp;
## Logic
The logic assumes the following:
- that there are 4 possible ports on the HBA (this is my HBA afterall)
- each breakout cable has 4 SATA breakout cables on it
&emsp;
   Port 1 - SATA 1-4&emsp;&emsp;Port 2 - SATA 5-8&emsp;&emsp;Port 3 - SATA 9-12&emsp;&emsp;Port 4 - SATA 13-16
&emsp;
- the drives are physically in the order displayed since the HBA-to-SATA cables are arranged this way. As there is currently no backplane implemented in my set-up, the HBA cannot report the actual physicl connections. To change the order of the drives displyed, change the SATA connector plugged into the drive.

&emsp;
&emsp;
## Future Plans
- Once I have other devices to play with, I may change the logic to better design the chassis around the device that TrueNAS is reporting it is connected to.
- Add Pool Label to the drives to better identify which drives are connected to which pool.
- 
