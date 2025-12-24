#!/usr/bin/env python3.9

from curses import baudrate
from dataclasses import field
from distutils.log import error
from email.header import Header
from heapq import merge
from logging import shutdown
import math
from random import random
from readline import append_history_file
import statistics
from pickletools import uint8
import queue
from turtle import width
import rospy
from tkinter import *
import sys
import open3d 
import serial
from sklearn import preprocessing
import time
import json
import struct
import numpy as np
from sensor_msgs.msg import LaserScan, Range, PointCloud2, PointField, Imu, PointCloud, ChannelFloat32,Image
from sensor_msgs import point_cloud2
from laser_geometry import LaserProjection
import sensor_msgs.point_cloud2 as pc2
import tf2_ros
import geometry_msgs
from geometry_msgs.msg import Point32, PointStamped, Polygon, PolygonStamped
from random import randrange
import cv2

timertrigger = False
stopwatch = 0

ser = serial.Serial(
    port='/dev/cu.usbserial-130',
    baudrate=115200,
    parity=serial.PARITY_NONE,
    stopbits=serial.STOPBITS_ONE,
    bytesize=serial.EIGHTBITS
)
mode = "2D"  # fill with 2D,3D or DUAL

errorcode = [4080,4081,4082,4083,4084,4085,4086,4087,4088,4089]
epsilon = 0.075
width = 160
length = 60
height = 1.5
fov = 120
vfov = 65
tablex = [x for x in range(width*length)]
tabley = [x for x in range(width*length)]
tablez = [x for x in range(width*length)]
angleCamera = [ 0.000000,  0.649278,  1.298556,  1.947834,  2.597113,  3.246391, 3.895669,
                4.544947,  5.194225,  5.843503,  6.492782,  7.142060,  7.791338, 8.440616,
                9.089894,  9.739172,  10.388451, 11.037729, 11.687007, 12.336285,
                12.985563, 13.634841, 14.284120, 14.933398, 15.582676, 16.231954,
                16.881232, 17.530510, 18.179789, 18.829067, 19.478345, 20.127623,
                20.776901, 21.426179, 22.075457, 22.724736, 23.374014, 24.023292,
                24.672570, 25.321848, 25.971126, 26.620405, 27.269683, 27.918961,
                28.568239, 29.217517, 29.866795, 30.516074, 31.165352, 31.814630,
                32.463908, 33.113186, 33.762464, 34.411743, 35.061021, 35.710299,
                36.359577, 37.008855, 37.658133, 38.307412, 38.956690, 39.605968,
                40.255246, 40.904524, 41.553802, 42.203080, 42.852359, 43.501637,
                44.150915, 44.800193, 45.449471, 46.098749, 46.748028, 47.397306,
                48.046584, 48.695862, 49.345140, 49.994418, 50.643697, 51.292975,
                51.942253, 52.591531, 53.240809, 53.890087, 54.539366, 55.188644,
                55.837922, 56.487200, 57.136478, 57.785756, 58.435035, 59.084313,
                59.733591, 60.382869, 61.032147, 61.681425, 62.330703, 62.979982,
                63.629260, 64.278538, 64.927816 ]

realImageSize = [   0.000000, 0.009109, 0.018221, 0.027340, 0.036469, 0.045612, 0.054770, 0.063949,
                    0.073151, 0.082379, 0.091637, 0.100928, 0.110256, 0.119622, 0.129032,
                    0.138487, 0.147992, 0.157548, 0.167160, 0.176831, 0.186563, 0.196359,
                    0.206223, 0.216158, 0.226167, 0.236252, 0.246417, 0.256665, 0.266998,
                    0.277420, 0.287933, 0.298541, 0.309246, 0.320052, 0.330961, 0.341977,
                    0.353103, 0.364342, 0.375698, 0.387174, 0.398773, 0.410500, 0.422359,
                    0.434354, 0.446488, 0.458768, 0.471197, 0.483782, 0.496527, 0.509438,
                    0.522522, 0.535786, 0.549236, 0.562880, 0.576726, 0.590783, 0.605060,
                    0.619565, 0.634311, 0.649306, 0.664563, 0.680093, 0.695909, 0.712025,
                    0.728453, 0.745209, 0.762308, 0.779765, 0.797597, 0.815821, 0.834455,
                    0.853516, 0.873023, 0.892996, 0.913455, 0.934419, 0.955910, 0.977950,
                    1.000560, 1.023764, 1.047585, 1.072049, 1.097183, 1.123014, 1.149573,
                    1.176892, 1.205008, 1.233960, 1.263789, 1.294543, 1.326272, 1.359031,
                    1.392875, 1.427865, 1.464057, 1.501507, 1.540263, 1.580362, 1.621823,
                    1.664646, 1.708800 ]
pixelRealSize = 0.02

colors = [
    [13	    ,8,	    135],
    [44	    ,5,	    148],
    [67	    ,3,	    158],
    [89	    ,1,	    165],
    [110	,0,	    168],
    [131	,5,	    167],
    [149	,17,	161],
    [167	,33,	151],
    [182	,48,	139],
    [197	,64,	126],
    [209	,78,	114],
    [221	,94,	102],
    [231	,110,	91],
    [240	,127,	79],
    [247	,144,	68],
    [252	,163,	56],
    [254	,183,	45],
    [252	,205,	37],
    [247	,226,	37],
    [240	,249,	33],
]

class Laser2PC():
    def __init__(self):
        rospy.loginfo("Laser to Pointcloud is running")
        self.laserProj = LaserProjection()
        self.pcpub = rospy.Publisher("/line_laser", PointCloud2, queue_size=1)
        self.lasersub = rospy.Subscriber("/scan", LaserScan, self.laserCallback)

    def laserCallback(self, data):
        cloud_out = self.laserProj.projectLaser(data)
        self.pcpub.publish(cloud_out)


class Scanner():
    def __init__(self):
        rospy.loginfo("Scanner Started")
        if mode == "2D":
            rate = rospy.Rate(15)
            self.stopwatch = rospy.Time.now()
            self.WINDOW = Tk()
            self.WINDOW.geometry("220x100")
            self.WINDOW.title("Assembler Measurement Timer")
            self.label_text = StringVar()
            self.label_text.set("Initialized")
            self.window_label = Label(self.WINDOW,textvariable = self.label_text)
            self.window_label.pack()
            self.timertrigger = False
        elif mode == "3D":
            rate = rospy.Rate(15)

        data = ""
        count = 0
        self.distort3DLens()
        while not rospy.is_shutdown():
            now = rospy.Time.now()
            start = time.time()
            data += ser.read().hex()
            # try:
            #     print("Decoded ",databyte.decode("utf-8"))
            # except:
            #     pass
            # ------------- PARSING 3D ------------------
            # if(len(data) > 160*60*4):
            #     print(data)
            #     data = ""
            #     print("Resetting")
            if mode == "3D":
                if "5a77ff413808" in data:
                # if "5aff38" in data:
                    self.process3D(data,count,now)
                    count += 1
                    data = ""
                    databyte = ""
                    rate.sleep()

                
            # ----------------------- PARSING 2D ------------------#
            elif mode == "2D":
                if "5a77ff430101" in data:
                    self.process2D(data,count,now)
                    count += 1
                    data = ""
                    try:
                        self.WINDOW.update()
                        rate.sleep()
                    except SystemExit:
                        Shutdown()
                    except KeyboardInterrupt:
                        Shutdown()

            
            elif mode == "DUAL":
                if "5a77ff430101" in data:
                    self.process3D(data,count,now)
                    count += 1
                    data = ""
                
                elif "5a77ff413808" in data:
                    self.process2D(data,count,now)
                    count += 1
                    data = ""
            
        else:
            Shutdown()
            

    def process2D(self, data,count,now):
        start = time.time()
        # l2c = Laser2PC()
        las = rospy.Publisher("/scan", LaserScan, queue_size=10)

        laser = LaserScan()
        data2D = data.replace("5a77ff430101","")

        if len(data2D) > 0:
            lsb = data2D[0:2]
            msb = data2D[2:4]
            payload = data2D[4:6]
            print(" -------------------------------------------- Got 2D packet ", len(data2D))
            laser.header.seq = count
            laser.header.stamp = now
            laser.header.frame_id = "laser_link"
            laser.angle_min = math.radians(0)
            laser.angle_max = math.radians(160)
            laser.angle_increment = math.radians(1)
            laser.scan_time = time.time()
            laser.time_increment = abs(start - time.time())
            laser.range_min = 0
            laser.range_max = 10000
            ranges = []
            newdata = data2D[0:len(data2D)-2]
            intensities = []
            laser.ranges = self.distortLaserScan(lsb, msb, payload, newdata)
            laser.intensities = self.parseIntensities(laser.ranges)

            rospy.loginfo(len(data) % 3)
                # if len(newdata) % 3 == 0:
                #     p = self.createXYZ(lsb, msb, payload, newdata)
                #     p.header = laser.header
                #     pub.publish(p)
                # msg.header = laser.header
                # msg.is_bigendian = True
                # msg.is_dense = False
            laser.intensities = intensities
            las.publish(laser)
            data = ""
            newdata = ""
            self.area(160, 60)

    def process3D(self, data,count,now):
        start = time.time()
        pc2pub = rospy.Publisher("/line_laser", PointCloud2, queue_size=100)
        image_pub = rospy.Publisher("/images", Image, queue_size=100)
        image = Image()
        maxlength = width * length

        if "5a77ff413808" in data:
            data3D = data.replace("5a77ff413808", "")
            # data3D = data.replace("5aff38", "")
            data3D = data3D[0:len(data3D)-2]
            if len(data3D) > 0:
                lsb = data3D[0:2]
                msb = data3D[2:4]
                payload = data3D[4:6]
                newdata = data3D
                if len(data3D) % 28800 == 0:
                    points = self.scanToPointCloud2(lsb, msb, payload, newdata)
                    points.header.seq = count
                    points.header.frame_id = "laser_link"
                    points.header.stamp = now
                    points.is_dense = False
                    image.header.seq = count
                    image.header.frame_id = "laser_link"
                    image.header.stamp = now
                    image.width = width
                    image.height = length
                    image.step = length
                    image.encoding = "rgb8"
                    image.data = self.scanToImage(newdata)
                    print(image)
                    pc2pub.publish(points)
                print(" -------------------------------------------- Got 3D packet ", len(data3D))
                image_pub.publish(image)
                data = ""
                newdata = ""



    def distortLaserScan(self,lsb,msb,payload,data):
        errorcode = [16000,16001,16002,16003,16004]
        msblsb = (int(msb, 16) + int(lsb, 16))
        nlsb = data[len(data)-4:len(data)-2]
        nmsb = data[len(data)-2:len(data)]
        payloadlength = int(payload, 16)
        msblsb =msblsb + payloadlength
        points = []
        maxCheck = 0
       
        for i in range(0,len(data),4):
            # angleGrad = self.getAngle(c,r,pixelRealSize)
            # maxCheck = angleGrad if angleGrad > maxCheck else 0
            
            angleRad = 1 *  math.pi / 180
            rp = math.sqrt( (i *i ) + (i * i))
            rua = math.sin(angleRad*2) 

            string = data[i:i+3]
            value = int(string,16)
            # if value not in errorcode:
                # if int(string,16) < 5000:
                #     points.append( int(int(string,16) * rua *10) )
                # else:)
            distance = int(string,16) * rua *1000
                # if distance >= 9999 :
                #     points.append(math.inf)
                # else:
            points.append(distance / 1000)

        norm = self.normalize(points,0.7,1)
        rev = norm
        # rev = norm[::-1]
        # rev = points
        # rev = points[::-1]
        rospy.loginfo("Rev:\n" + (" ".join(str(x) for x in rev)) + "\t"+str(len(rev)))

        right = [rev[x-1] for x in range(len(rev)-10,len(rev)-20,-1)]
        left =  [rev[x] for x in range(10,len(rev)-(len(rev)-20),1)]
        print("LEFT\t",left,"\tRIGHT\t",right)

        for i in range(len(right)):

            if right[i] > 300 and right[i] < 9000:
                rospy.loginfo("Rightside detected!!" + str(self.timertrigger)+ " "+str(right))
                if self.timertrigger == True:
                    duration  = rospy.Time.now() - self.stopwatch 
                    self.label_text.set(self.label_text.get() + "\nTack time :"+str( duration.to_sec())+" sec")
                    self.stopwatch = rospy.Time.now()
                    self.timertrigger = False
                    self.window_label.update()

        for i in range(len(left)):
            if left[i] > 300 and left[i] < 9000:
                rospy.loginfo("LEFTSIDE detected!!" + str(self.timertrigger)+" "+str(left))   
                self.timertrigger = True
        duration  = abs(self.stopwatch - rospy.Time.now())
        rospy.logwarn("Duration :"+str(duration))
        return rev


    def parsingData(self, lsb, msb, payload, data):
        msblsb = (int(msb, 16) + int(lsb, 16))
        nlsb = data[len(data)-4:len(data)-2]
        nmsb = data[len(data)-2:len(data)]
        payloadlength = int(payload, 16)
        msblsb =msblsb + payloadlength
        points = []
        offset = 3
        xbefore = 0
        xafter = 0
        distancefilter = 200
        for i in range(0, len(data), offset):
            string = data[i:i+offset]
            currentx = int(string,16)
            if i ==0:
                xbefore = 0
            elif i >= len(data)-3:
                xafter = 0
            else:
                xbefore = int(data[i-offset:i],16)
            if ( abs(currentx - xafter) > distancefilter) and ( abs(currentx - xbefore) > distancefilter):
                points.append(0)
            else:
                points.append(int(string, 16))
        rev = points[::-1]

        return rev

    def scanToPointCloud(self, lsb, msb, payload, data):
        msblsb = (int(msb, 16) + int(lsb, 16))
        nlsb = data[len(data)-4:len(data)-2]
        nmsb = data[len(data)-2:len(data)]
        payloadlength = int(payload, 16)
        msbpayload = msblsb + payloadlength + int(nlsb, 16) + int(nmsb, 16)
        # ranges = [i**3 for i in range(600)]
        # print(msbpayload)/

        Shutdown()

    def scanToImage(self,data):
        points = []
        for i in range(0,int(len(data)/3),3):
            value = "0x"+str(data[i:i+3])
            value = int(value,base=16)
            data3 = value * tablez[i]
            colorindex = int(map(randrange(20),0,20,19,0))
            print("value",value,colorindex)
            points.append(colors[colorindex][0])
            points.append(colors[colorindex][1])
            points.append(colors[colorindex][2])
        # rev = points[::-1]
        # print(rev,len(rev))
        return points 

    def scanToPointCloud2(self, lsb, msb, payload, data):
        print("Pointcloud2 called")
        pc = PointCloud2()

        # dataLength = int(width * length * height)
        # values = [ int(data[i],16) for i in range(0,len(data),2)]
        points = []
        fields = [
            PointField('X',0,PointField.FLOAT32,1),
            PointField('Y',1,PointField.FLOAT32,1),
            PointField('Z',2,PointField.FLOAT32,1),
            # PointField('intensity',12,PointField.FLOAT32,1),
        ]
        for i in range(0,int(len(data)/3),3):
            
            value = "0x"+str(data[i:i+3])
            value = int(value,base=16) #if int(value,16) not in errorcode else math.inf
            data1 = value * tablex[i]
            data2 = value * tabley[i]
            data3 = value * tablez[i]
            points.append([data1,data3,data2])

            # if i == 0:
            #     data1 = value * tablex[i]
            #     data2 = value * tabley[i]
            #     data3 = value * tablez[i]
            #     points.append([data1,data3,data2])
            # else:
            #     data1 = value * tablex[int(i/3)]
            #     data2 = value * tabley[int(i/1)]
            #     data3 = value * tablez[int(i/1)]
            #     points.append([data1,data3,data2])
        pc.fields = fields
        pcs = point_cloud2.create_cloud_xyz32(pc.header,points)
        # pcs = point_cloud2.create_cloud_xyz32(pc.header,points[::-1])
        return pcs
        # pc = PointCloud2()
        # dataLength = int(width * length * height)
        # distanceBufferIndex = 0
        # values = [ int(data[i],16) for i in range(0,len(data),2)]
        # points = []
        # fields = [
        #     PointField('x',0,PointField.FLOAT32,1),
        #     PointField('y',4,PointField.FLOAT32,1),
        #     PointField('x',8,PointField.FLOAT32,1),
        #     # PointField('intensity',12,PointField.FLOAT32,1),
        # ]
        # print("Tablex",tablex)
        # for i in range(0,int(len(data)/3),3):
        #     value = data[i:i+3] 
        #     value = int(value,16)
        #     if i == 0:
        #         data1 = value * tablex[i]
        #         data2 = value * tabley[i]
        #         data3 = value * tablez[i]
        #         points.append([data1,data3,data2])
        #     else:
        #         data1 = value * tablex[int(i/3)]
        #         data2 = value * tabley[int(i/3)]
        #         data3 = value * tablez[int(i/3)]
        #         points.append([data1,data3,data2])
        
        # pcs = point_cloud2.create_cloud_xyz32(pc.header,points[::-1])
        # return pcs



    def distort3DLens(self):
        print("Distorting lens")
        offset_x = 0
        offset_y = 0
        r0 = 1 - (length/2) + offset_x
        c0 = 1 - (width/2) + offset_y
        maxcheck = 0
        for row in range(length):
            maxcheck = 0
            for col in range(width):
               
                c = float( (col + c0) - 0.5)
                r = float( (row + r0) - 0.5)
                anglegrad = self.getAngle(c,r,pixelRealSize)
                maxcheck = anglegrad if (anglegrad > maxcheck) else maxcheck
                angleradians = math.radians(anglegrad)
                rp =  float(math.sqrt((c*c) + (r*r)))
                rua = float(math.sin(anglegrad))
                tablex[col + (row * width)] = (c * rua /rp) * 0.1
                tabley[col + (row * width)] = (r * rua /rp) * 0.1
                tablez[col + (row * width)] = (float(math.cos(angleradians))) *0.2
                


    def normalize(self,list_normal,lower,upper):
        norm = [lower + (upper - lower) * x for x in list_normal]
        return norm
       
        
    def getAngle(self,x,y,sensorPointSizeMM):
        radius = sensorPointSizeMM * math.sqrt((x * x) + (y * y))
        alfaGrad = 0
        for i in range(1,len(angleCamera)):
            if radius >= realImageSize[i - 1] and radius <= realImageSize[i]:
                alfaGrad = map(radius,realImageSize[i-1],angleCamera[i-1],realImageSize[i],angleCamera[i])
                # alfaGrad = interpolate(radius, realImageSize[i - 1], angleCamera[i - 1], realImageSize[i], angleCamera[i])
                # alfaGrad = interpolate(radius,realImageSize[i-1],angleCamera[i-1],realImageSize[i],angleCamera[i])
        return alfaGrad
       


    def area(self, lat, lon):
        count = 0
        projection = rospy.Publisher(
            "/projection", PolygonStamped, queue_size=1)
        while not rospy.is_shutdown():
            ps = PolygonStamped()
            ps.header.stamp = rospy.Time.now()
            ps.header.frame_id = "laser_link"
            ps.header.seq = 0

            poly = Polygon()
            for i in range(lat):
                point = Point32()
                if i >= lat/2:
                    point.x = math.cos(160)
                    point.y = math.sin(i)
                    poly.points.append(point)
                else:
                    point.x = math.sin(90)
                    point.y = math.sin(0)
                    poly.points.append(point)
            # for i in range(lat,0,-2):
            #     point = Point32()
            #     for j in range(0,i):
            #         x1 = j * 45
            #         y =  i
            #         z = j/1000
            #         point.x = math.cos(x1)
            #         point.y = math.cos(y)
            #         poly.points.append(point)
            #         poly.points.append(point)

            ps.polygon = poly
            projection.publish(ps)
            count += 1
            return True
        else:
            Shutdown()

    def createXYZ(self, lsb, msb, payload, data):

        msblsb = (int(msb, 16) + int(lsb, 16))
        payloadlength = int(payload, 16)
        pc = PointCloud()
        channelx = ChannelFloat32()
        channely = ChannelFloat32()
        channelz = ChannelFloat32()
        channelx.name = "distance"
        channely.name = "u"
        channelz.name = "v"
        for i in range(0, len(data), 6):
            pf = Point32()
            x1 = data[i:i+3]
            x2 = data[i+4:i+6]
            z = data[i+2:i+4]
            y1 = data[i:i+2]
            y2 = data[i+5:i+6]

            pf.x = math.sin(statistics.median([int(x1, 16)/2, int(x2, 16)/2]))
            channelx.values.append(map(statistics.median([int(x1, 16)/2, int(x2, 16)/2]), 0, 4000,255,0))
            pf.y = math.cos(statistics.median([int(y1, 16)/2, int(y2, 16)/2]))
            channely.values.append(map(statistics.median([int(y1, 16)/2, int(y2, 16)/2]), 0, 4000,255,0))
            pf.z = int(z, 16)/2 / 1000
            channelz.values.append(map(int(z, 16), 0, 2000, 255, 0))
            pc.points.append(pf)
        pc.channels = [channelx, channely, channelz]
        return pc

    def parseIntensities(self, data):
        value = []
        for i in range(len(data)):
            value.append(map(data[i], 5, 2000, 255, 5))
        return value


class Shutdown():
    def __init__(self):
        print("Turning off sensor")
        stop = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x02, 0x00, 0x00])
        ser.write(stop)
        sys.exit(0)

def interpolate(xin,x0,y0,x1,y1):
    if ((math.fabs(x1 - x0) < sys.float_info.epsilon)):
        return y0
    else:
	    return ((xin - x0) * (y1 - y0) / (x1 - x0)) + y0

def map(x, in_min, in_max, out_min, out_max):
    if x > in_max:
        return out_max
    elif x < in_min:
        return out_min
    else:
        return ((x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min)


def checkSum(buff, size):
    checksum = 0
    offset = 3
    for x in range(offset, size - 1):
        checksum ^= buff[x]
    return checksum


if __name__ == "__main__":
    rospy.init_node("LidarCYG")
    br = tf2_ros.TransformBroadcaster()
    imu = Imu()
    t = geometry_msgs.msg.TransformStamped()
    t.header.stamp = imu.header.stamp
    t.header.frame_id = "laser"
    t.child_frame_id = "tf"
    t.transform.translation.x = 0.0
    t.transform.translation.y = 0.0
    t.transform.translation.z = 0.0
    t.transform.rotation = imu.orientation
    # pub = rospy.Publisher("line_laser", LaserScan, queue_size=10)
    if mode == "2D":
        thestring = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x01, 0x00, 0x03])  # 2D
        baudsum = checkSum(thestring, len(thestring))
        baud = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA, baudsum]) #115200
        # baud = bytes([ 0x5a, 0x77, 0xff, 0x02, 0x00, 0x12, 0x55, 0x45])	#300000

        ser.write(baud)
        time.sleep(0.5)
        ser.write(thestring)

    elif mode == "3D":
        thestring = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x08, 0x00, 0x0A])  # 3D

        baudsum = checkSum(thestring, len(thestring))
        # sensitive = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00,0x01, 0x, baudsum])  # 250 sensitive # 10.000 duration pulse for 3D
        sensitivesum = checkSum( bytes([0x5A, 0x77, 0xFF, 0x02, 0x00,0x01, 0xFA]),len(bytes([0x5A, 0x77, 0xFF, 0x02, 0x00,0x01, 0xFA])))
        pulsesum = checkSum(bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x40]),len(bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x40])))
        # pulse = bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x40, pulsesum])
        # pulse = bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x00, pulsesum])
        pulse = bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x00, 0x78]) # 10.000 duration pulse for 3D
        # freqChecksum = checkSum(bytes([0x5A,0x77,0xFF,0x02,0x00,0x0F,0xF0]),len(bytes([0x5A,0x77,0xFF,0x02,0x00,0x0F,0xF0])))
        # print("Freq checksum:",freqChecksum)
        # freq = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x0F, 0xF0,freqChecksum])
        # pulse = bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x40, 0x3c, 0x10]) #8000 pulse
        freq = bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x40, 0x5f, 0x10]) #freq channel 15
        sensitive = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x11, 0x96, 0x85])  # 250 sensitive 
        baud = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA, 0xba])	#115200 
        # baud = bytes([ 0x5a, 0x77, 0xff, 0x02, 0x00, 0x12, 0x55, 0x45])	#300000
        # ser.write(baud)
        # time.sleep(0.5)
        ser.write(sensitive)
        time.sleep(0.5)
        ser.write(freq)
        time.sleep(0.5)
        ser.write(pulse)
        time.sleep(0.5)
        ser.write(thestring)
        
    elif mode == "DUAL":
        thestring = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00,0x07, 0x00, 0x05])  # Dual mode 2D/3D
        baudsum = checkSum(thestring, len(thestring))
        baud = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA, baudsum])
        ser.write(baud)
        time.sleep(0.5)
        ser.write(thestring)
    else:
        print("mode is not selected. Exitting.")
        sys.exit(0)

    # sensitive = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x11, 0xFA, 0x03])  # 250 sensitive
    
    
    # time.sleep(0.5)
    # ser.write(pulse)
    # time.sleep(0.5)
    # ser.write(sensitive)
    br.sendTransform(t)
    try:
        while not rospy.is_shutdown():
            rospy.loginfo("Starting mode "+mode)
            try:
                scanner = Scanner()
                rospy.spin()
            except KeyboardInterrupt:
                Shutdown()
        else:
            Shutdown()
    except KeyboardInterrupt:
        Shutdown()
