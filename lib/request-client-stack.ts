import {  CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AssetImage } from 'aws-cdk-lib/aws-ecs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { LocustMasterService } from './constructs/locust-master-service';
import { LocustWorkerService } from './constructs/locust-worker-service';

interface LoadTestStackProps extends StackProps {
  readonly allowedCidrs: string[];
  readonly certificateArn?: string;
  readonly webUsername?: string;
  readonly webPassword?: string;
}

export class RequestClientStack extends Stack {
  constructor(scope: Construct, id: string, props: LoadTestStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'RequestClientVPC', {
      ipAddresses: ec2.IpAddresses.cidr('10.100.0.0/24'),
      natGateways: 1,
    });

    const logBucket = new Bucket(this, 'LogBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    vpc.addFlowLog('FlowLogS3', {
      destination: ec2.FlowLogDestination.toS3(logBucket, 'vpcFlowLog'),
    });

    vpc.node.findChild('FlowLogS3').node.findChild('FlowLog').node.addDependency(logBucket);

    const cluster = new ecs.Cluster(this, 'LocustCluster', {
      vpc: vpc,
      defaultCloudMapNamespace: { name: 'locust' },
      containerInsights: true,
    });

    const locustImage = new AssetImage('app');

    const master = new LocustMasterService(this, 'LocustMaster', {
      image: locustImage,
      cluster: cluster,
      certificationArn: props.certificateArn,
      allowedCidrs: props.allowedCidrs,
      logBucket: logBucket,
      webUsername: props.webUsername,
      webPassword: props.webPassword,
    });

    const worker1 = new LocustWorkerService(this, 'LocustWorker1', {
      image: locustImage,
      cluster: cluster,
      locustMasterHostName: master.configMapHostName,
    });

    const worker2 = new LocustWorkerService(this, 'LocustWorker2', {
      image: locustImage,
      cluster: cluster,
      locustMasterHostName: master.configMapHostName,
    });

    const worker3 = new LocustWorkerService(this, 'LocustWorker3', {
      image: locustImage,
      cluster: cluster,
      locustMasterHostName: master.configMapHostName,
    });

    master.allowWorkerConnectionFrom(worker1);
    master.allowWorkerConnectionFrom(worker2);
    master.allowWorkerConnectionFrom(worker3);

    new CfnOutput(this, 'Worker1ServiceName', {
      value: worker1.service.serviceName,
    });
    new CfnOutput(this, 'Worker2ServiceName', {
      value: worker2.service.serviceName,
    });
    new CfnOutput(this, 'Worker3ServiceName', {
      value: worker3.service.serviceName,
    });
  }
}
