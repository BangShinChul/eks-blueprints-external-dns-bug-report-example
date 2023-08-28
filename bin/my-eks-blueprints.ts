#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as blueprints from "@aws-quickstart/eks-blueprints";
import { PublicHostedZoneStack } from "../lib/public-hosted-zone-stack";
import { RequestClientStack } from "../lib/request-client-stack";
import { demoApplicationDeploy } from "../lib/utils/deploy-demo-application";

const app = new cdk.App();

const myEnv = { account: "000000000000", region: "ap-northeast-2" }; // Edit it according to your account

new RequestClientStack(app, "request-client-stack", {
  env: myEnv,
  allowedCidrs: ["127.0.0.1/32"],
  webUsername: "awsuser",
  webPassword: "passw0rd",
});
new PublicHostedZoneStack(app, "public-hosted-zone-stack");

const publicHostedZoneId = cdk.Fn.importValue("publicHostedZoneId");

const addOns: Array<blueprints.ClusterAddOn> = [
  new blueprints.addons.AwsLoadBalancerControllerAddOn(),
  new blueprints.addons.CalicoOperatorAddOn(),
  new blueprints.addons.SSMAgentAddOn(),
  new blueprints.addons.VpcCniAddOn({
    serviceAccountPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"),
    ],
  }),
  new blueprints.addons.ClusterAutoScalerAddOn(),
  new blueprints.addons.CoreDnsAddOn("v1.10.1-eksbuild.1"),
  new blueprints.addons.KubeProxyAddOn("v1.27.1-eksbuild.1"),
  new blueprints.addons.ExternalDnsAddOn({
    hostedZoneResources: ["my-cluster-hosted-zone"],
  }),
];

const myCluster = blueprints.EksBlueprint.builder()
  .account(myEnv.account)
  .region(myEnv.region)
  .addOns(...addOns)
  .name("my-cluster")
  .version(eks.KubernetesVersion.V1_27)
  .resourceProvider(
    "my-cluster-hosted-zone",
    new blueprints.ImportHostedZoneProvider(publicHostedZoneId)
  )
  .resourceProvider(
    blueprints.GlobalResources.Vpc,
    new (class implements blueprints.ResourceProvider<ec2.IVpc> {
      provide(context: blueprints.ResourceContext): cdk.aws_ec2.IVpc {
        return new ec2.Vpc(context.scope, "my-cluster-vpc", {
          ipAddresses: ec2.IpAddresses.cidr("172.51.0.0/16"),
          availabilityZones: [
            `${myEnv.region}a`,
            `${myEnv.region}b`,
            `${myEnv.region}c`,
          ],
          subnetConfiguration: [
            {
              cidrMask: 24,
              name: "my-cluster-private",
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            {
              cidrMask: 24,
              name: "my-cluster-public",
              subnetType: ec2.SubnetType.PUBLIC,
            },
          ],
          natGatewaySubnets: {
            availabilityZones: [`${myEnv.region}c`],
            subnetType: ec2.SubnetType.PUBLIC,
          },
        });
      }
    })()
  )
  .useDefaultSecretEncryption(false)
  .build(app, "eks-blueprint-my-cluster");

demoApplicationDeploy(myCluster.getClusterInfo().cluster, "demo-application");
