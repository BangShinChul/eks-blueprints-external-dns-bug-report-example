# This project is a demo for external-DNS bug reporting.

### Pre-Requisites
- You'll need your own domain with **name-servers configurable**.
- [AWS Account](https://aws.amazon.com/resources/create-account/) : Create an AWS account and set the [AdministratorAccess](https://docs.aws.amazon.com/ko_kr/IAM/latest/UserGuide/getting-set-up.html#create-an-admin) permission to a user in that account. The user's permissions are required to provision AWS resources such as VPCs, EKS, and ALBs required for the demo.
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) : Install the AWS CLI, and [set up the aws credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-format) on the PC where you want to perform the demo.
- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install)
- [docker](https://docs.docker.com/engine/install/)
- [npm](https://nodejs.org/ko/download)
- [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl)
- [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)

### Quick Start

```
cdk bootstrap
cdk synth
cdk deploy --all
```