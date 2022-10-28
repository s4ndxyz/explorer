import React, { FC, useState } from 'react';
import { Box, color, Flex, Grid, Stack, transition } from '@stacks/ui';
import { Caption, Text, Title } from '@components/typography';
import { border } from '@common/utils';
import { TxItem } from '@components/transaction-item';
import { useRouter } from 'next/router';

import {
  contractSearchQueryState,
  currentFunctionState,
  txContractState,
  txDetailsState,
} from '@sandbox/store/sandbox';
import { IconButton } from '@components/icon-button';
import { ChevronDown } from '@components/icons/chevron-down';
import { MempoolTransaction, Transaction } from '@stacks/stacks-blockchain-api-types';
import { Pending } from '@components/status';
import { Badge } from '@components/badge';
import { ContractCallIcon } from '@components/icons/contract-call';
import { InfoCircleIcon } from '@components/icons/info-circle';
import { ExternalLinkIcon } from '@components/icons/external-link';
import { buildUrl, TxLink } from '@components/links';
import { FilteredMessage, FilterPanel } from '@components/filter-panel';

import { FilterIcon } from '@components/icons/filter';
import { functionCallViewState } from '@sandbox/store/views';
import { useSetRecoilState } from 'recoil';
import { useAppDispatch, useAppSelector } from '@common/state/hooks';
import { selectActiveNetwork } from '@common/state/network-slice';
import { useFilterState } from '@common/hooks/use-filter-state';
import { useTransactionQueries } from '@features/transaction/use-transaction-queries';
import { useQuery } from 'react-query';
import { transactionQK, TransactionQueryKeys } from '@features/transaction/query-keys';
import { setCodeBody } from '@modules/sandbox/sandbox-slice';

const PanelHeader: React.FC = () => {
  const { toggleFilterVisibility } = useFilterState();
  return (
    <>
      <Flex
        justifyContent="space-between"
        px="base"
        borderBottom={border()}
        py="tight"
        bg={color('bg')}
      >
        <Caption>Transactions</Caption>

        <Caption
          display="flex"
          alignItems="center"
          _hover={{ cursor: 'pointer', color: color('text-title') }}
          onClick={toggleFilterVisibility}
        >
          <FilterIcon mr="extra-tight" color="currentColor" size="18px" strokeWidth={1.5} />
          Filter transactions
        </Caption>
      </Flex>
    </>
  );
};

const LoadButton = ({ codeBody }: { codeBody: string }) => {
  const router = useRouter();
  const activeNetworkMode = useAppSelector(selectActiveNetwork).mode;
  const [loaded, setLoaded] = React.useState(false);
  const [clicked, setClicked] = React.useState(false);
  const dispatch = useAppDispatch();

  return loaded ? (
    <Badge userSelect="none" border={border()} color={color('text-caption')}>
      Loaded!
    </Badge>
  ) : !clicked ? (
    <Badge
      userSelect="none"
      _hover={{ cursor: 'pointer', color: color('text-title') }}
      border={border()}
      color={color('text-caption')}
      onClick={() => setClicked(true)}
    >
      Load in editor
    </Badge>
  ) : (
    <Badge userSelect="none" border={border()} color={color('text-caption')}>
      <Flex>
        <Box
          _hover={{ cursor: 'pointer', color: color('text-title') }}
          pr="tight"
          onClick={() => setClicked(false)}
        >
          Cancel
        </Box>
        <Box
          _hover={{ cursor: 'pointer', color: color('text-title') }}
          pl="tight"
          borderLeft={border()}
          onClick={() => {
            setClicked(false);
            dispatch(setCodeBody({ codeBody }));
            setLoaded(true);
            void router.push(buildUrl('/sandbox/deploy', activeNetworkMode));
            setTimeout(() => {
              setLoaded(false);
            }, 3000);
          }}
        >
          Confirm
        </Box>
      </Flex>
    </Badge>
  );
};

const TxDetailsFunctions = ({
                              hasFunctionsAvailable,
                              contractInterface,
                              contractId,
                              status,
                            }: any) => {
  const router = useRouter();
  const setView = useSetRecoilState(functionCallViewState);
  const setQuery = useSetRecoilState(contractSearchQueryState);
  const setCurrentFunction = useSetRecoilState(currentFunctionState);
  const [fnsVisible, setFnsVisibility] = React.useState(false);

  const handleSetFunction = (name: string) => {
    setView('function-overview');
    setQuery(contractId);
    setCurrentFunction(name);
    void router.push(buildUrl('/sandbox/contract-call'));
  };

  const handleSetContractQuery = () => {
    void router.push(buildUrl('/sandbox/contract-call'));
    setQuery(contractId);
    setCurrentFunction(undefined);
    setView('function-overview');
  };

  return hasFunctionsAvailable ? (
    <>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        borderBottom={fnsVisible ? border() : 'unset'}
        px="base"
        pb="tight"
        pt="base-tight"
      >
        <Caption fontWeight="500" color={color('text-body')}>
          Call contract
        </Caption>
        <Stack isInline spacing="tight" alignItems="center">
          <Badge
            userSelect="none"
            _hover={{
              cursor: 'pointer',
              color: color('text-title'),
            }}
            border={border()}
            color={color('text-caption')}
            onClick={handleSetContractQuery}
          >
            Load contract
          </Badge>
          <IconButton
            size="24px"
            iconProps={{
              size: '16px',
              strokeWidth: 2,
              transform: !fnsVisible ? 'none' : 'rotate(180deg)',
              transition,
            }}
            dark
            onClick={() => {
              setFnsVisibility(s => !s);
            }}
            icon={ChevronDown}
          />
        </Stack>
      </Flex>
      {fnsVisible ? (
        <Stack maxHeight="120px" overflowX="auto" spacing="0">
          {contractInterface?.abi?.functions?.map((func: any, index: number, arr: any[]) => {
            return func.access !== 'private' ? (
              <Flex
                borderBottom={index === arr.length - 1 ? 'unset' : border()}
                px="base"
                py="tight"
                alignItems="center"
                justifyContent="space-between"
              >
                <Flex alignItems="center" color={color('text-caption')}>
                  {func.access === 'read_only' ? (
                    <InfoCircleIcon size="18px" />
                  ) : (
                    <ContractCallIcon size="18px" />
                  )}
                  <Caption color={color('text-body')} ml="extra-tight">
                    {func.name}
                  </Caption>
                </Flex>
                {status === 'success' ? (
                  <Badge
                    _hover={{ color: color('text-title'), cursor: 'pointer' }}
                    color={color('text-caption')}
                    border={border()}
                    onClick={() => handleSetFunction(func.name)}
                  >
                    Load function
                  </Badge>
                ) : null}
              </Flex>
            ) : null;
          })}
        </Stack>
      ) : null}
    </>
  ) : null;
};

const TxDetails: React.FC<{
  status?: Transaction['tx_status'];
  type: Transaction['tx_type'];
  txId: Transaction['tx_id'];
  contractId: string;
}> = React.memo(({ contractId, txId, type, status }) => {
  const apiServer = useAppSelector(selectActiveNetwork).url;
  const queries = useTransactionQueries();

  const { data: contract } = useQuery(
    transactionQK(TransactionQueryKeys.contract, contractId),
    queries.fetchContract(contractId),
    { staleTime: Infinity, enabled: !!contractId }
  );

  const hasFunctionsAvailable =
    type === 'smart_contract' && status === 'success' && contract?.abi?.functions?.length;

  if (!contract) return null;

  return (
    <>
      <Box>
        <Box>
          <Flex
            justifyContent="space-between"
            borderBottom={hasFunctionsAvailable ? border() : 'unset'}
            px="base"
            py="tight"
            alignItems="center"
          >
            <Caption fontWeight="500" color={color('text-body')}>
              Redeploy contract
            </Caption>
            <LoadButton codeBody={contract.source_code} />
          </Flex>
          <TxDetailsFunctions
            contractId={contractId}
            status={status}
            hasFunctionsAvailable={hasFunctionsAvailable}
            contractInterface={contract}
          />
          <TxLink txid={txId}>
            <Flex
              as="a"
              _hover={{
                bg: color('bg-alt'),
              }}
              borderTop={border()}
              px="base"
              py="base-tight"
              alignItems="center"
              target="_blank"
            >
              <Caption
                mr="tight"
                fontWeight="500"
                color={color('text-body')}
                transform="translateY(1px)"
              >
                View transaction
              </Caption>
              <ExternalLinkIcon color={color('text-caption')} size="18px" />
            </Flex>
          </TxLink>
        </Box>
      </Box>
    </>
  );
});

const SandboxTxItem = React.memo(
  ({ tx, isLast, stxAddress }: { tx: Transaction; isLast?: boolean; stxAddress: string }) => {
    const [detailsVisible, setDetailsVisible] = useState(false);
    return (
      <Box px="loose" key={tx.tx_id} borderBottom={!isLast ? border() : undefined}>
        <Flex alignItems="center" justifyContent="space-between">
          <TxItem
            width="unset"
            flexGrow={0}
            hideRightElements
            minimal
            principal={stxAddress}
            tx={tx}
          />
          {tx.tx_type === 'token_transfer' && (
            <TxLink txid={tx.tx_id}>
              <IconButton as="a" target="_blank" flexShrink={0} dark icon={ExternalLinkIcon} />
            </TxLink>
          )}
          {tx.tx_type === 'smart_contract' || tx.tx_type === 'contract_call' ? (
            <IconButton
              color={color('text-caption')}
              _hover={{ bg: color('bg-alt') }}
              invert
              onClick={() => {
                setDetailsVisible(!detailsVisible);
              }}
              iconProps={{
                size: '24px',
                transform: detailsVisible ? 'rotate(180deg)' : 'none',
                transition,
              }}
              icon={ChevronDown}
            />
          ) : null}
        </Flex>
        {detailsVisible && (tx.tx_type === 'smart_contract' || tx.tx_type === 'contract_call') ? (
          <Box pb="base">
            <Box boxShadow="mid" borderRadius={'12px'} border={border()} bg={color('bg')}>
              <React.Suspense
                fallback={
                  <Box p="base">
                    <Flex>
                      <Pending mr="base" size={'14px'} />
                      <Caption>Fetching contract interface</Caption>
                    </Flex>
                  </Box>
                }
              >
                <TxDetails
                  txId={tx.tx_id}
                  type={tx.tx_type}
                  status={tx.tx_status}
                  contractId={
                    tx.tx_type === 'smart_contract'
                      ? tx.smart_contract.contract_id
                      : tx.contract_call.contract_id
                  }
                />
              </React.Suspense>
            </Box>
          </Box>
        ) : null}
      </Box>
    );
  }
);

export const TransactionsPanel: FC<{
  transactions: Transaction[];
  mempoolTransactions: MempoolTransaction[];
  stxAddress: string;
}> = React.memo(({ transactions, mempoolTransactions, stxAddress }) => {
  const { activeFilters } = useFilterState();

  const filteredTxs = (transactions || []).filter(tx => activeFilters[tx.tx_type]);
  const hasTxButIsFiltered = transactions?.length && filteredTxs?.length === 0;

  const pendingList = React.useMemo(
    () =>
      mempoolTransactions?.map(tx => (
        <Flex borderBottom={border()} px="loose" alignItems="center" justifyContent="space-between">
          <TxItem
            hideRightElements
            minimal
            principal={stxAddress}
            tx={tx}
            key={tx.tx_id}
            width="auto"
          />
          <TxLink txid={tx.tx_id}>
            <IconButton as="a" target="_blank" flexShrink={0} dark icon={ExternalLinkIcon} />
          </TxLink>
        </Flex>
      )),
    [mempoolTransactions]
  );

  const txList = React.useMemo(
    () =>
      filteredTxs.map((tx, key, arr) => (
        <SandboxTxItem
          tx={tx}
          key={tx.tx_id}
          isLast={key === arr.length - 1}
          stxAddress={stxAddress}
        />
      )),
    [filteredTxs, activeFilters, transactions]
  );
  return (
    <Flex
      position="relative"
      flexDirection="column"
      flexGrow={1}
      bg={color('bg-alt')}
      borderBottomRightRadius="12px"
      overflow="hidden"
    >
      <PanelHeader />
      <FilterPanel showBorder bg={color('bg')} />

      <Flex
        flexDirection="column"
        flexGrow={1}
        maxHeight="900px"
        overflow="auto"
        bg={color('bg')}
        position="relative"
      >
        <>
          {pendingList}
          {filteredTxs?.length ? (
            txList
          ) : hasTxButIsFiltered ? (
            <FilteredMessage />
          ) : (
            <Flex flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
              <Stack textAlign="center">
                <Title>No Transactions</Title>
                <Caption>Your list of transactions will display here.</Caption>
              </Stack>
            </Flex>
          )}
        </>
      </Flex>
    </Flex>
  );
});
