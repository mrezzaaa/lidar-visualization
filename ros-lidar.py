#!/usr/bin/env python3.9

from curses import baudrate
from dataclasses import field
import math
from random import random
import statistics
from pickletools import uint8
import queue
from turtle import width
import rospy
import sys
import serial
import time
import json
import struct
import numpy as np
from sensor_msgs.msg import LaserScan, Range, PointCloud2, PointField, Imu,PointCloud,ChannelFloat32
from laser_geometry import LaserProjection
import sensor_msgs.point_cloud2 as pc2
import ros_numpy
import tf2_ros
import geometry_msgs
from geometry_msgs.msg import Point32


ser = serial.Serial(
    port='/dev/cu.usbserial-120',
    baudrate=115200,
    parity=serial.PARITY_NONE,
    stopbits=serial.STOPBITS_ONE,
    bytesize=serial.EIGHTBITS
)
speed_of_light = 299792458
fov = 120
vov = 65
halfFov = fov/2
halfVov = vov / 2
rad = math.radians(120)
halfcos = math.cos(halfFov)
halfsin = math.sin(halfFov)
visionradius = 2000
epsilon = 0.075
halfAuxRayTilt = rad/2
halfAuxRayTiltCos = math.cos(halfAuxRayTilt)
halfAuxRayTitlSin = math.sin(halfAuxRayTilt)


def checkSum(buff, size):
    checksum = 0
    offset = 3
    for x in range(offset, size - 1):
        checksum ^= buff[x]
    return checksum


def main():
    # print(ser.isOpen())
    LidarCYG = rospy.init_node("LidarCYG")
    rospy.loginfo("Node LidarCYG activated")
    imu = Imu()
    br = tf2_ros.TransformBroadcaster()
    t = geometry_msgs.msg.TransformStamped()
    t.header.stamp = imu.header.stamp
    t.header.frame_id = "laser"
    t.child_frame_id = "tf"
    t.transform.translation.x = 0.0
    t.transform.translation.y = 0.0
    t.transform.translation.z = 0.0
    t.transform.rotation = imu.orientation
    # pub = rospy.Publisher("line_laser", LaserScan, queue_size=10)
    thestring = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x08, 0x00, 0x0A])  # 3D
    # thestring = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x01, 0x00, 0x03])  # 2D
    sensitive = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00,
                      0x11, 0xFA, 0x03])  # 250 sensitive
    pulse = bytes([0x5a, 0x77, 0xff, 0x03, 0x00, 0x0c, 0x10, 0x67, 0x78])
    baudsum = checkSum(bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA]), len(
        bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA])))
    baud = bytes([0x5A, 0x77, 0xFF, 0x02, 0x00, 0x12, 0xAA, baudsum])
    ser.write(baud)
    time.sleep(0.5)
    ser.write(thestring)
    time.sleep(0.5)
    # ser.write(pulse)
    br.sendTransform(t)
    # sampleData()
    # scan2D()
    time.sleep(2)
    scan3DL()
    # scan3D()
    # laserScan()
    # laserRange()


def laserRange():
    count = 1
    pub = rospy.Publisher("line_laser", Range, queue_size=10)
    rate = rospy.Rate(10)
    while not rospy.is_shutdown():
        in_bin = ser.read(6).hex()
        msg = Range()
        msg.header.seq = count
        msg.header.stamp = rospy.Time.now()
        msg.header.frame_id = "laser"
        msg.radiation_type = msg.INFRARED
        msg.field_of_view = 120.0
        msg.min_range = 0.02
        msg.max_range = 8

        if (in_bin == "5a77ff430101"):
            rospy.logwarn("-------------------------")
        else:
            # in_bin = ser.read_until('5a77ff').hex()
            resolution = range(120)
            ranges = []
            for x in resolution:
                data = ser.read(4).hex()
                val = struct.unpack("!f", bytes.fromhex(data))[0]
                ranges.append(struct.unpack("!f", bytes.fromhex(data))[0])
            # data = ser.read(4).hex()
            msg.range = np.array(ranges, dtype=float)
            pub.publish(msg)
            rospy.loginfo(ranges)
            rate.sleep()
            count += 1
    else:
        print("Stopping sensor")
        stop = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x02, 0x00, 0x00])
        ser.write(stop)
        sys.exit(0)


def laserScan():
    count = 1
    pub = rospy.Publisher("line_laser", LaserScan, queue_size=10)
    rate = rospy.Rate(10)
    while not rospy.is_shutdown():
        in_bin = ser.read(6).hex()
        scan_time = rospy.Time.now()
        msg = LaserScan()
        msg.header.seq = count
        msg.header.stamp = rospy.Time.now()
        msg.header.frame_id = "laser"
        msg.angle_min = 0
        msg.angle_max = 120
        msg.angle_increment = 0.75
        msg.time_increment = 0.1
        msg.scan_time = time.time()
        msg.range_min = 0.02
        msg.range_max = 8

        if (in_bin == "5a77ff430101"):
            rospy.logwarn("-------------------------")
        else:
            # in_bin = ser.read_until('5a77ff').hex()
            resolution = range(119)
            ranges = []
            intensities = []
            for x in resolution:
                data = ser.read(4).hex()
                val = struct.unpack("!f", bytes.fromhex(data))[0]
                ranges.append(struct.unpack(
                    "!f", bytes.fromhex(data))[0] / 1000)
                if val > 5:
                    intensities.append(0.2)
                else:
                    intensities.append(0.8)
            # data = ser.read(4).hex()
            msg.ranges = ranges
            msg.intensities = intensities
            pub.publish(msg)
            rospy.loginfo(ranges)
            rate.sleep()
            count += 1
    else:
        print("Stopping sensor")
        stop = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x02, 0x00, 0x00])
        ser.write(stop)
        sys.exit(0)


def scan2D():
    pub = rospy.Publisher("scan", LaserScan, queue_size=10)
    RNG = rospy.Publisher("range_scan", Range, queue_size=10)
    rate = rospy.Rate(1000)
    thestring = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x01, 0x00, 0x03])  # 2D
    cmdsum = hex(checkSum(thestring, len(thestring)))
    print("Command sum:" + str(cmdsum).replace("x", ""))
    while not rospy.is_shutdown():
        count = 0
        in_bin = ser.read(6).hex()
        scan_time = rospy.Time.now()
        laser = LaserScan()
        rng = Range()
        if (in_bin == "5a77ff430101"):
            rospy.logwarn("----------Starting--------------")
        else:
            # in_bin = ser.read_until('5a77ff').hex()
            width = 160
            height = 60
            data = ""
            while not rospy.is_shutdown():
                now = rospy.Time.now()
                start = time.time()
                ranges = []
                fields = []
                data += ser.read().hex()
                if "5a77ff4301" in data:
                    data = data.replace("5a77ff4301", "")
                    lsb = data[0:2]
                    msb = data[2:2+2]
                    header = data[4:4+2]
                    payloadoffset = 6
                    rospy.loginfo(data)
                    # print("LSB:",lsb,int(lsb,16))
                    # print("MSB:",msb,int(msb,16))
                    print("Header:", header, int(header, 16))
                    # shutdownSensor()
                    rng.header.seq = count
                    rng.header.stamp = rospy.Time.now()
                    rng.header.frame_id = "laser"
                    rng.radiation_type = rng.INFRARED
                    rng.field_of_view = 120.0
                    rng.min_range = -60
                    rng.max_range = 60

                    laser.header.seq = count
                    laser.header.stamp = now
                    laser.header.frame_id = "laser"
                    laser.angle_min = 0
                    laser.angle_max = 120
                    laser.angle_increment = 0.75
                    laser.time_increment = time.time() - start
                    laser.scan_time = time.time()
                    print("Time scan :", now)
                    laser.range_min = 2/1000
                    laser.range_max = 8000/1000
                    ranges = [math.inf for i in range(360)]
                    fields = [math.inf for i in range(360)]
                    cond = int(msb, 16) if int(header, 16) < int(
                        msb, 16) else int(header, 16)
                    theta = 0
                    print("Angled", int(120/0.75))
                    for x in range(payloadoffset, int(120/0.75), 2):
                        point = data[x:(2 if x == 0 else x+2)]
                        theta = math.radians(x)
                        point = int(point, 32) if len(point) > 0 else 0
                        # duration = (2 * point * math.cos(theta)) / 9.8
                        # tof = (speed_of_light * duration / 2)
                        # p = int(point,16).to_bytes(4,byteorder="big").hex()
                        # point = struct.unpack("!f",bytes.fromhex(p))[0]
                        # print(point)

                        # ranges.append(point)
                        ranges[x] = (2 * math.pi * (8/2) *
                                     point * theta / 1000)
                        fields[x] = map((point * theta / 1000), 0, 8, 1, 0)
                    rospy.loginfo(len(ranges))
                    laser.ranges = ranges
                    rng.range = float(8)
                    laser.intensities = fields
                    pub.publish(laser)
                    RNG.publish(rng)
                    rate.sleep()
                    data = ""  # clearing data
                    count += 1
    else:
        shutdownSensor()


def sampleData():
    count = 1
    pub = rospy.Publisher("/line_laser", PointCloud2, queue_size=1)
    las = rospy.Publisher("/scan", LaserScan, queue_size=1)
    rate = rospy.Rate(10)
    
    scan_time = rospy.Time.now()
    msg = PointCloud2()
    laser = LaserScan()
    count = 0
    while not rospy.is_shutdown():
        now = rospy.Time.now()
        start = time.time()
        ranges = []
        fields = []
        intensities = []
        laser.header.seq = count
        laser.header.stamp = now
        laser.header.frame_id = "laser_link"
        laser.angle_min = math.radians(0)
        laser.angle_max = math.radians(120)
        laser.angle_increment = math.radians(halfFov)
        laser.time_increment = start - time.time()
        laser.scan_time = time.time()
        laser.range_min = 0.005
        laser.range_max = 8
        msg.header.seq = count
        msg.header.stamp = now
        msg.header.frame_id = "laser_link"
        msg.is_bigendian = True
        msg.is_dense = False
        for i in range(38400):
            if i < halfFov:
                ranges.append(i * halfcos)
                intensities.append(1)
               
            else:
                ranges.append(i * halfsin)
                intensities.append(1)
               

        for x in range(4):
            if x == 0:
                jsondata = PointField()
                jsondata.count = 1
                jsondata.datatype = 7
                jsondata.name = "x"
                jsondata.offset = 0
                fields.append(jsondata)
            elif x == 1:
                jsondata = PointField()
                jsondata.count = 1
                jsondata.datatype = 7
                jsondata.name = "z"
                jsondata.offset = 1
                fields.append(jsondata)

            elif x == 2:
                jsondata = PointField()
                jsondata.count = 1
                jsondata.datatype = 7
                jsondata.name = "z"
                jsondata.offset = 2
                fields.append(jsondata)

            elif x == 3:
                jsondata = PointField()
                jsondata.count = 1
                jsondata.datatype = 7
                jsondata.name = "intensity"
                jsondata.offset = 3
                fields.append(jsondata)

        msg.width = 160
        msg.height = 60
        msg.point_step = 4
        msg.row_step = 4
        msg.data = ranges
        laser.ranges = ranges
        laser.intensities = intensities
        msg.fields = fields
        # pub.publish(msg)
        las.publish(laser)
        rospy.loginfo(len(ranges))
        ranges = []
        fields = []
        count += 1
        time.sleep(2)
    else:
        shutdownSensor()


def scan3DL():
    count = 1
    pub = rospy.Publisher("/line_laser", PointCloud, queue_size=1)
    pcpub = rospy.Publisher("/scan_3D",PointCloud2,queue_size=10)
    las = rospy.Publisher("/scan", LaserScan, queue_size=1)
    rate = rospy.Rate(1)
    thestring = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x08, 0x00, 0x0A])  # 3D
    cmdsum = hex(checkSum(thestring, len(thestring)))
    print("Command sum:" + str(cmdsum))
    while not rospy.is_shutdown():
        now = rospy.Time.now()
        start = time.time()
        in_bin = ser.read(6).hex()
        scan_time = rospy.Time.now()
        msg = PointCloud2()
        laser = LaserScan()
        pcl = PointCloud()
        lsp = LaserProjection()
        if (in_bin == "5a77ff413808"):
            rospy.logwarn("----------Starting--------------")
        else:
            # in_bin = ser.read_until('5a77ff').hex()
            width = 160
            height = 60
            data = ""
            while not rospy.is_shutdown():
                ranges = []
                fields = []
                data += ser.read().hex()
                if "5a77ff413808" in data:
                    data = data.replace("5a77ff413808", "")
                    offset = 0
                    laser.header.seq = count
                    laser.header.stamp = now
                    laser.header.frame_id = "laser_link"
                    laser.angle_min = 0
                    laser.angle_max = 160
                    laser.angle_increment = 0.75
                    laser.time_increment = start - time.time()
                    laser.scan_time = time.time()
                    laser.range_min = 0.005
                    laser.range_max = 8000
                    msg.header.seq = count
                    msg.header.stamp = now
                    msg.header.frame_id = "laser_link"
                    msg.is_bigendian = True
                    msg.is_dense = False
                
                    # Parsing data 3D
                    ranges = [0 for x in range(160*60*3)]
                    datawithoutchecksum = data[0:len(data)-2]
                    resolution = 160 * 60 * 3

                    for i in range(0,len(datawithoutchecksum),6):
                        points = Point32()
                        channels = ChannelFloat32()
                        string = datawithoutchecksum[i:i+6]
                        for j in range(0,len(string),3):
                            dist = string[j:j+3]
                            points.y = 2* math.pi * math.cos(int(dist,16))
                            print("Index - ",i)
                            ranges[i] = np.uint8(int(dist,16))
                            # ranges.append(int(points.y))

                        for j in range(0,len(string),2):
                            hor = string[j:j+2]
                            if j == 2:
                                points.z = 2 * math.pi * (int(hor,32)/2)/1000
                                print("Index - ",i)
                                ranges[i] = np.uint8(int(hor,16))
                                # ranges.append(int(points.z))

                            points.x = 2* math.pi * math.sin(int(hor,16))
                            print("Index - ",i)
                            ranges[i] = np.uint8(int(hor,16))
                            # ranges.append(int(points.x))

                        pcl.points.append(points)
                        
                    
                    for x in range(4):
                        if x == 0:
                            jsondata = PointField()
                            jsondata.count = 1
                            jsondata.datatype = 7
                            jsondata.name = "x"
                            jsondata.offset = 0
                            fields.append(jsondata)
                        elif x == 1:
                            jsondata = PointField()
                            jsondata.count = 1
                            jsondata.datatype = 7
                            jsondata.name = "y"
                            jsondata.offset = 1
                            fields.append(jsondata)

                        elif x == 2:
                            jsondata = PointField()
                            jsondata.count = 1
                            jsondata.datatype = 7
                            jsondata.name = "z"
                            jsondata.offset = 2
                            fields.append(jsondata)

                    # print("Length array data wcheck", len(ranges),len(data), len(datawithoutchecksum))
                    # print("Half Cos:", halfcos)
                    # print("Half Sin:", halfsin)
                    print(len(ranges),len(datawithoutchecksum))
                    # shutdownSensor()

                    msg.width = int(len(ranges)/16)
                    msg.height = 1
                    msg.point_step = 16
                    msg.data = ranges
                    msg.row_step = 16
                    laser.ranges = ranges
                    msg.fields = fields
                    # cloud = lsp.projectLaser(laser)
                    # pub.publish(pc2)
                    pcl.header = msg.header
                    # pclxyz = ros_numpy.point_cloud2.pointcloud2_to_xyz_array(msg)
                    pcpub.publish(msg)
                    pub.publish(pcl)
                    # las.publish(laser)
                    rospy.loginfo(len(ranges))
                    ranges = []
                    fields = []
                    count += 1
                    data = ""
            rate.sleep()
    else:
        print("Stopping sensor")
        shutdownSensor()


def scan3D():
    count = 1
    pub = rospy.Publisher("/line_laser", PointCloud2, queue_size=1)
    las = rospy.Publisher("/scan", LaserScan, queue_size=1)
    rate = rospy.Rate(1)
    thestring = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x08, 0x00, 0x0A])  # 3D
    cmdsum = hex(checkSum(thestring, len(thestring)))
    print("Command sum:" + str(cmdsum))
    while not rospy.is_shutdown():
        now = rospy.Time.now()
        start = time.time()
        in_bin = ser.read(6).hex()
        scan_time = rospy.Time.now()
        msg = PointCloud2()
        laser = LaserScan()
        if (in_bin == "5a77ff413808"):
            rospy.logwarn("----------Starting--------------")
        else:
            # in_bin = ser.read_until('5a77ff').hex()
            width = 160
            height = 60

            data = ""
            while not rospy.is_shutdown():
                ranges = []
                fields = []
                data += ser.read().hex()
                if "5a77ff413808" in data:
                    data = data.replace("5a77ff413808", "")
                    offset = 0
                    laser.header.seq = count
                    laser.header.stamp = now
                    laser.header.frame_id = "laser_link"
                    laser.angle_min = 0
                    laser.angle_max = 120
                    laser.angle_increment = 0.75
                    laser.time_increment = start - time.time()
                    laser.scan_time = time.time()
                    laser.range_min = 50
                    laser.range_max = 8000
                    msg.header.seq = count
                    msg.header.stamp = now
                    msg.header.frame_id = "laser_link"
                    msg.is_bigendian = True
                    msg.is_dense = False
                    # Parsing data 3D
                    for i in range(0, 160*60, 6):
                        x = data[i:i+2]
                        y = data[i+2:i+4]
                        z = data[i+4:i+6]
                        w = 1
                        print("Hex:", data[i:i+6])
                        print("X:", x, int(x, 16))
                        print("Y:", z, int(y, 16))
                        print("Z:", y, int(z, 16))
                        ranges.append(np.uint8(int(x, 16)))
                        ranges.append(np.uint8(int(y, 16)))
                        ranges.append(np.uint8(int(z, 16)))
                        ranges.append(w)

                    # for i in range(0,120*65,6):
                    #     x = data[i:i+2]
                    #     y = data[i+2:i+4]
                    #     z = data[i+4:i+6]
                    #     w = 5
                    #     print("Hex:",data[i:i+6])
                    #     print("X:",x,int(x,16))
                    #     print("Y:",y,int(y,16))
                    #     print("Z:",z,int(z,16))
                    #     ranges.append( np.uint8(int(x,16) ))
                    #     ranges.append( np.uint8(int(y,16)))
                    #     ranges.append( np.uint8(int(z,16)))
                    #     ranges.append(w)

                    for n in range(4):
                        if n == 0:
                            jsondata = PointField()
                            jsondata.name = "x"
                            jsondata.offset = 0
                            jsondata.count = 1
                            jsondata.datatype = 7
                            fields.append(jsondata)
                        elif n == 1:
                            jsondata = PointField()
                            jsondata.name = "y"
                            jsondata.offset = 1
                            jsondata.count = 1
                            jsondata.datatype = 7
                            fields.append(jsondata)

                        elif n == 2:
                            jsondata = PointField()
                            jsondata.name = "z"
                            jsondata.offset = 2
                            jsondata.count = 1
                            jsondata.datatype = 7
                            fields.append(jsondata)
                        elif n == 3:
                            jsondata = PointField()
                            jsondata.name = "w"
                            jsondata.offset = 3
                            jsondata.count = 1
                            jsondata.datatype = 7
                            fields.append(jsondata)

                    msg.width = int(160/2)
                    msg.height = int(160/2)
                    msg.point_step = 1
                    msg.row_step = 1
                    msg.data = ranges
                    laser.ranges = ranges
                    msg.fields = fields
                    pub.publish(msg)
                    las.publish(laser)
                    rospy.loginfo(len(ranges))
                    ranges = []
                    fields = []
                    count += 1
                    data = ""
                    # shutdownSensor()

            # for x in resolution:
            #     data = ser.read_until(cmd).hex()
            #     row = str(data)[:2]
            #     col = str(data)[2:4]
            #     distance1 = str(data)[:3]
            #     print(data)
                # jsondata = PointField()
                # jsondata.name = str(x)
                # jsondata.datatype = jsondata.UINT8
                # jsondata.offset = len(ranges)
                # jsondata.count = x
                # ranges.append(np.uint8(int(rowval,16)/2)*np.uint8(int(colval,16)/2))
                # fields.append(jsondata)
                # print("Row val:"+str(int(rowval,16)/2))
                # print("Col val:"+str(int(colval,16)/2))
                # print("Distance val:"+str(int(distance,16)))
                # print("---------------------------End of " + str(x))
            # data = ser.read(4).hex()
            # laser.ranges = ranges
            # msg.data = ranges
            # msg.fields = fields
            # pub.publish(msg)
            # las.publish(laser)
            # rospy.loginfo(ranges)
            rate.sleep()
    else:
        print("Stopping sensor")
        shutdownSensor()


def map(x, in_min, in_max, out_min, out_max):
    if x > in_max:
        return out_max
    else:
        return ((x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min)

def triangle(val):
    c = []
    for i in range(len(val),3):
        var = Point32()
        var.x = val[i]
        var.y = val[i+1]
        var.z = val[i+2]
        c.append(var)
    return c

def isZero(v):
    return (abs(v[0]) + abs(v[1])) <= epsilon


def cross2d(a, b):
    return (a[0] * b[1]) - (a[1] * b[0])


def isParallel(a, b):
    return (abs(cross2d(a, b)) <= epsilon)


def shutdownSensor():
    print("Turning off Lidar")
    stop = bytes([0x5a, 0x77, 0xff, 0x02, 0x00, 0x02, 0x00, 0x00])
    ser.write(stop)
    sys.exit(0)


if (__name__ == "__main__"):
    try:
        main()
        rospy.spin()
    except KeyboardInterrupt:
        print("Ctrl + C detected")
        shutdownSensor()
