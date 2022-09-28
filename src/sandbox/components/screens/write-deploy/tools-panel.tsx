import React from 'react';
import { Button, Flex } from '@stacks/ui';
import { ContractName } from '@sandbox/components/views/deploy/contract-name';
import { Caption, Title } from '@components/typography';
import { useNetworkConfig } from '@common/hooks/use-network-config';
import { handleContractDeploy } from '@sandbox/common/connect-functions';
import { useCodeEditor } from '@sandbox/components/code-editor/code-editor';
import { useRecoilState } from 'recoil';
import { contractNameState } from '@sandbox/store/sandbox';
import { useConnect } from '@sandbox/hooks/use-connect';
import { Goals, useFathomGoal } from '@common/hooks/use-fathom';

export const WriteAndDeployTools: React.FC = props => {
  const { handleTrackGoal } = useFathomGoal();
  const [codeBody] = useCodeEditor();
  const [contractName] = useRecoilState(contractNameState);
  const { isSignedIn, doOpenAuth } = useConnect();

  const network = useNetworkConfig();
  const onDeploy = React.useCallback(() => {
    handleTrackGoal(isSignedIn ? Goals.SANDBOX_DEPLOY : Goals.SANDBOX_SIGNIN);
    void handleContractDeploy({
      network,
      postConditionMode: 0x01,
      codeBody,
      contractName,
    });
  }, [codeBody, contractName, codeBody]);

  const goToPlatform = () => {
    window
      ?.open(
        `${
          process.env.NEXT_PUBLIC_PLATFORM_BASE_URL
        }/editor/draft?contractName=${encodeURIComponent(
          contractName
        )}&codeBody=${encodeURIComponent(codeBody)}`,
        '_blank'
      )
      ?.focus();
  };

  return (
    <Flex flexDirection="column" flexGrow={1} p="loose" {...props}>
      <Title mb="extra-loose" fontSize="24px">
        Write & Deploy
      </Title>
      <Caption mb="tight">Contract name</Caption>
      <ContractName />
      <Button onClick={isSignedIn ? onDeploy : doOpenAuth} mt="base-loose" width="100%">
        {isSignedIn ? 'Deploy' : 'Connect Stacks Wallet'}
      </Button>
      <Button onClick={goToPlatform} mt="base-loose" width="100%">
        Save Project
      </Button>
    </Flex>
  );
};
