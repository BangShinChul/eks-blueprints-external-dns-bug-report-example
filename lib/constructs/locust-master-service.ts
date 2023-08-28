import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  ApplicationProtocol,
  SslPolicy,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { LocustWorkerService } from "./locust-worker-service";

export interface LocustMasterServiceProps {
  readonly image: ecs.ContainerImage;
  readonly cluster: ecs.ICluster;
  readonly certificationArn?: string;
  readonly allowedCidrs: string[];
  readonly logBucket: IBucket;
  readonly webUsername?: string;
  readonly webPassword?: string;
}

export class LocustMasterService extends Construct {
  public readonly configMapHostName: string;
  private readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: LocustMasterServiceProps) {
    super(scope, id);

    const { cluster, image, webUsername, webPassword } = props;

    const configMapName = "master";

    const protocol =
      props.certificationArn != null
        ? ApplicationProtocol.HTTPS
        : ApplicationProtocol.HTTP;

    let certificate = undefined;
    if (props.certificationArn != null) {
      certificate = Certificate.fromCertificateArn(
        this,
        "Cert",
        props.certificationArn
      );
    }

    const masterTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        cpu: 1024,
        memoryLimitMiB: 2048,
      }
    );

    const command = ["--master"];
    if (webUsername != null && webPassword != null) {
      command.push("--web-auth");
      command.push(`${webUsername}:${webPassword}`);
    }

    masterTaskDefinition.addContainer("locust", {
      image,
      command,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "locust-master",
        logRetention: RetentionDays.ONE_WEEK,
      }),
      portMappings: [
        {
          containerPort: 8089,
        },
      ],
    });

    const master = new ApplicationLoadBalancedFargateService(this, "Service", {
      cluster,
      desiredCount: 1,
      targetProtocol: ApplicationProtocol.HTTP,
      protocol: protocol,
      openListener: false,
      cloudMapOptions: {
        name: configMapName,
      },
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskDefinition: masterTaskDefinition,
      healthCheckGracePeriod: Duration.seconds(20),
      certificate: certificate,
      sslPolicy:
        protocol == ApplicationProtocol.HTTPS
          ? SslPolicy.RECOMMENDED
          : undefined,
      circuitBreaker: { rollback: true },
    });

    master.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');

    master.targetGroup.configureHealthCheck({
      interval: Duration.seconds(15),
      healthyThresholdCount: 2,
      healthyHttpCodes: '200,401',
    });

    const port = protocol == ApplicationProtocol.HTTPS ? 443 : 80;
    props.allowedCidrs.forEach((cidr) => 
      master.loadBalancer.connections.allowFrom(ec2.Peer.ipv4(cidr), ec2.Port.tcp(port)),
    );

    master.loadBalancer.logAccessLogs(props.logBucket, 'locustAlbAccessLog');

    this.service = master.service;
    this.configMapHostName = `${configMapName}.${cluster.defaultCloudMapNamespace!.namespaceName}`;
  }

  public allowWorkerConnectionFrom(worker: LocustWorkerService) {
    this.service.connections.allowFrom(worker.service, ec2.Port.tcp(5557));
  }
}
