import styled from '@emotion/styled';
import { Formik } from 'formik';
import { removeListener } from 'process';
import React, { FC, ReactNode, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { openContractCall } from '@stacks/connect';
import {
  ClarityAbiFunction,
  ClarityValue,
  FungibleConditionCode,
  NonFungibleConditionCode,
  PostCondition,
  PostConditionMode,
  createAssetInfo,
  encodeClarityValue,
  isClarityAbiList,
  isClarityAbiOptional,
  isClarityAbiPrimitive,
  listCV,
  makeStandardFungiblePostCondition,
  makeStandardNonFungiblePostCondition,
  makeStandardSTXPostCondition,
  stringAsciiCV,
} from '@stacks/transactions';
import { Box, Button, Flex, Input, Stack, color, usePrevious } from '@stacks/ui';

import { CONNECT_AUTH_ORIGIN } from '@common/constants';
import { useNetworkConfig } from '@common/hooks/use-network-config';
import { validateStacksAddress } from '@common/utils';

import { Dropdown } from '@components/Dropdown';
import { InfoCircleIcon } from '@components/icons/info-circle';
import { Section } from '@components/section';
import { Toggle } from '@components/toggle';
import { Tooltip } from '@components/tooltip';
import { Caption, Text } from '@components/typography';

import { ListValueType, NonTupleValueType, TupleValueType, ValueType } from '../../types';
import { encodeTuple, getTuple } from '../../utils';
import { Argument } from '../Argument';
import { ReadOnlyField } from './ReadOnlyField';

interface FunctionViewProps {
  fn: ClarityAbiFunction;
  contractId: string;
  cancelButton: ReactNode;
}

enum PostConditionType {
  Stx = 'STXPostCondition',
  Fungible = 'FungiblePostCondition',
  NonFungible = 'NonFungiblePostCondition',
}

const postConditionParameterMap = {
  [PostConditionType.Stx]: ['address', 'conditionCode', 'amount'],
  [PostConditionType.Fungible]: [
    'address',
    'conditionCode',
    'amount',
    'assetAddress',
    'assetContractName',
    'assetName',
  ],
  [PostConditionType.NonFungible]: [
    'address',
    'conditionCode',
    'assetAddress',
    'assetContractName',
    'assetName',
  ],
};

const postConditionParameterLabels: Record<string, string> = {
  address: 'Address',
  conditionCode: 'Condition Code',
  amount: 'Amount',
  assetAddress: 'Asset Address',
  assetContractName: 'Asset Contract Name',
  assetName: 'Asset Name',
};

const PostConditionOptions = [
  { label: 'STX Post Condition', value: PostConditionType.Stx },
  { label: 'Fungible Post Condition', value: PostConditionType.Fungible },
  { label: 'Non-Fungible Post Condition', value: PostConditionType.NonFungible },
];

interface PostConditionParameters {
  address?: string;
  conditionCode?: NonFungibleConditionCode | FungibleConditionCode;
  amount?: number;
  assetAddress?: string;
  assetContractName?: string;
  assetName?: string;
}

function getPostCondition(
  postConditionType: PostConditionType,
  postConditionParameters: PostConditionParameters
): PostCondition[] {
  const { address, conditionCode, amount, assetAddress, assetContractName, assetName } =
    postConditionParameters;
  let postCondition;

  if (postConditionType === PostConditionType.Stx) {
    if (address && conditionCode && amount) {
      postCondition = makeStandardSTXPostCondition(
        address,
        conditionCode as FungibleConditionCode,
        amount
      );
    }
  } else if (postConditionType === PostConditionType.Fungible) {
    if (address && assetAddress && assetContractName && assetName && conditionCode && amount) {
      const assetInfo = createAssetInfo(assetAddress, assetContractName, assetName);
      postCondition = makeStandardFungiblePostCondition(
        address,
        conditionCode as FungibleConditionCode,
        amount,
        assetInfo
      );
    }
  } else if (postConditionType === PostConditionType.NonFungible) {
    if (address && assetAddress && assetContractName && assetName && conditionCode) {
      const assetInfo = createAssetInfo(assetAddress, assetContractName, assetName);
      postCondition = makeStandardNonFungiblePostCondition(
        address,
        conditionCode as NonFungibleConditionCode,
        assetInfo,
        stringAsciiCV(assetName)
      );
    }
  } else {
    throw new Error(`There is no post condition type that matches ${postConditionType}`);
  }

  if (!postCondition) throw new Error('Post condition is undefined');
  return [postCondition];
}

type FormType = Record<string, ValueType | ListValueType>;

const checkFunctionParameters = (fn: ClarityAbiFunction, values: any) => {
  const errors: Record<string, string> = {};
  Object.keys(values).forEach(arg => {
    const type = fn.args.find(({ name }) => name === arg)?.type;
    const isOptional = type && isClarityAbiOptional(type);
    const optionalTypeIsPrincipal =
      isOptional && isClarityAbiPrimitive(type.optional) && type.optional === 'principal';
    if (type === 'principal' || (optionalTypeIsPrincipal && !!values[arg])) {
      const validPrincipal = validateStacksAddress(
        (values[arg] as NonTupleValueType).toString().split('.')[0]
      );
      if (!validPrincipal) {
        errors[arg] = 'Invalid Stacks address.';
      }
    }
  });
  return errors;
};

const checkPostConditionParameters = (values: any) => {
  const errors: Record<string, string> = {};
  Object.keys(values).forEach(arg => {
    if (arg === 'address' || arg === 'assetAddress') {
      if (!validateStacksAddress(values[arg])) {
        errors[arg] = 'Invalid Stacks address.';
      }
    }
    if (arg === 'amount') {
      if (values[arg] < 0 || !(Number.isFinite(values[arg]) && Number.isInteger(values[arg]))) {
        errors[arg] = 'Invalid amount';
      }
    }
  });
  return errors;
};

export const FunctionViewWithRHF: FC<FunctionViewProps> = ({ fn, contractId, cancelButton }) => {
  const [readOnlyValue, setReadonlyValue] = useState<ClarityValue[]>();
  const [isPostConditionModeEnabled, setPostConditionMode] = useState<PostConditionMode>(
    PostConditionMode.Deny
  );
  const [showPostCondition, setShowPostCondition] = useState(false);
  const [postCondition, setPostCondition] = useState<PostConditionType | undefined>(undefined);
  const prevIsPostConditionModeEnabled = usePrevious(isPostConditionModeEnabled);
  const network = useNetworkConfig();

  const initialFunctionParameterValues = useMemo(
    () =>
      fn.args.reduce((argsAcc, arg) => {
        const tuple = getTuple(arg.type);
        const isList = isClarityAbiList(arg.type);
        argsAcc[arg.name] = !!tuple
          ? tuple.reduce((tupleAcc, tupleEntry) => {
              tupleAcc[tupleEntry.name] = '';
              return tupleAcc;
            }, {} as Record<string, string | number>)
          : isList
          ? []
          : '';
        return argsAcc;
      }, {} as FormType),
    [fn]
  );
  const { register, handleSubmit } = useForm({
    mode: 'onSubmit',
    defaultValues: {
      functionParameters: { ...initialFunctionParameterValues },
      postConditionParameters: {
        address: null,
        amount: null,
        conditionCode: null,
        assetName: null,
        assetAddress: null,
        assetContractName: null,
      },
    },
  });

  const onError = (errors, e) => console.log(errors, e);
  const onSubmit = (data, e) => {
    const final: Record<string, ClarityValue> = {};
    Object.keys(values).forEach(arg => {
      const type = fn.args.find(({ name }) => name === arg)?.type;
      if (!type) return;
      const tuple = getTuple(type);
      const isList = isClarityAbiList(type);
      const optionalType = isClarityAbiOptional(type) ? type?.optional : undefined;
      if (tuple) {
        final[arg] = encodeTuple(tuple, values[arg] as TupleValueType);
      } else if (isList) {
        const listValues = values[arg] as ListValueType;
        const listType = type.list.type;
        const optionalListType = isClarityAbiOptional(listType) ? listType?.optional : undefined;
        const listTuple = getTuple(listType);
        const listData = listValues.map(listValue =>
          listTuple
            ? encodeTuple(listTuple, listValue as TupleValueType)
            : encodeClarityValue(
                optionalListType || listType,
                (listValue as NonTupleValueType).toString()
              )
        );
        final[arg] = listCV(listData);
      } else {
        final[arg] = encodeClarityValue(
          optionalType || type,
          (values[arg] as NonTupleValueType).toString()
        );
      }
    });
    if (fn.access === 'public') {
      const { address, conditionCode, amount, assetAddress, assetContractName, assetName } = values;

      void openContractCall({
        contractAddress: contractId.split('.')[0],
        contractName: contractId.split('.')[1],
        functionName: encodeURIComponent(fn.name),
        functionArgs: Object.values(final),
        network,
        authOrigin: CONNECT_AUTH_ORIGIN,
        postConditions:
          showPostCondition && postCondition
            ? getPostCondition(postCondition, {
                address,
                conditionCode,
                amount,
                assetAddress,
                assetContractName,
                assetName,
              })
            : undefined,
        postConditionMode: isPostConditionModeEnabled,
      });
    } else {
      setReadonlyValue(Object.values(final));
    }
  };


  useEffect(() => {
    if (!showPostCondition) {
      setPostCondition(undefined);
    }
    if (
      prevIsPostConditionModeEnabled === PostConditionMode.Deny &&
      isPostConditionModeEnabled === PostConditionMode.Allow &&
      showPostCondition
    ) {
      setShowPostCondition(false);
    }
  }, [showPostCondition, isPostConditionModeEnabled, prevIsPostConditionModeEnabled]);

  return (
    <Section
      overflowY="visible"
      flexGrow={1}
      title={`${fn.name} (${fn.access} function)`}
      borderRadius={'0'}
    >
      {readOnlyValue ? (
        <ReadOnlyField
          fn={fn}
          readOnlyValue={readOnlyValue}
          contractId={contractId}
          cancelButton={cancelButton}
        />
      ) : (
        <Box p="extra-loose" as="form" onSubmit={handleSubmit}>
          <Flex marginBottom="16px" justifyContent="flex-end">
            <Toggle
              onClick={() =>
                setPostConditionMode(
                  isPostConditionModeEnabled === PostConditionMode.Deny
                    ? PostConditionMode.Allow
                    : PostConditionMode.Deny
                )
              }
              label={
                isPostConditionModeEnabled === PostConditionMode.Deny ? 'Deny Mode' : 'Allow Mode'
              }
              value={isPostConditionModeEnabled === PostConditionMode.Allow ? true : false}
            />
            <Tooltip
              label={
                <Box>
                  Allow mode is less secure than Deny mode. Allow mode permits asset transfers that
                  are not covered by post conditions. In Deny mode no other asset transfers are
                  permitted besides those named in the post conditions
                </Box>
              }
            >
              <Flex alignItems="center" marginLeft="8px">
                <InfoCircleIcon size="18px" />
              </Flex>
            </Tooltip>
          </Flex>
          {fn.args.length ? (
            <Stack mb="extra-loose" spacing="base">
              {fn.args.map(({ name, type }) => (
                <Argument
                  handleChange={handleChange}
                  name={name}
                  type={type}
                  error={errors[name]}
                  key={name}
                  value={values[name]}
                />
              ))}
            </Stack>
          ) : null}
          <Flex flexDirection="column" alignItems="center" justifyContent="center">
            <Button type="submit">Call function</Button>
            {cancelButton}
          </Flex>
        </Box>
      )}
    </Section>
  );
  //   return (
  //     <Formik
  //       initialValues={
  //         {
  //           ...initialFunctionParameterValues,
  //           ...initialPostConditionParameterValues,
  //         } as any
  //       }
  //       validateOnChange={false}
  //       validateOnBlur={false}
  //       validate={values => {
  //         const functionParametersErrors = checkFunctionParameters(fn, values);
  //         const postConditionParametersErrors = checkPostConditionParameters(values);
  //         const errors = Object.assign({}, functionParametersErrors, postConditionParametersErrors);
  //         return errors;
  //       }}
  //       onSubmit={values => {
  //         const final: Record<string, ClarityValue> = {};
  //         Object.keys(values).forEach(arg => {
  //           const type = fn.args.find(({ name }) => name === arg)?.type;
  //           if (!type) return;
  //           const tuple = getTuple(type);
  //           const isList = isClarityAbiList(type);
  //           const optionalType = isClarityAbiOptional(type) ? type?.optional : undefined;
  //           if (tuple) {
  //             final[arg] = encodeTuple(tuple, values[arg] as TupleValueType);
  //           } else if (isList) {
  //             const listValues = values[arg] as ListValueType;
  //             const listType = type.list.type;
  //             const optionalListType = isClarityAbiOptional(listType)
  //               ? listType?.optional
  //               : undefined;
  //             const listTuple = getTuple(listType);
  //             const listData = listValues.map(listValue =>
  //               listTuple
  //                 ? encodeTuple(listTuple, listValue as TupleValueType)
  //                 : encodeClarityValue(
  //                     optionalListType || listType,
  //                     (listValue as NonTupleValueType).toString()
  //                   )
  //             );
  //             final[arg] = listCV(listData);
  //           } else {
  //             final[arg] = encodeClarityValue(
  //               optionalType || type,
  //               (values[arg] as NonTupleValueType).toString()
  //             );
  //           }
  //         });
  //         if (fn.access === 'public') {
  //           const { address, conditionCode, amount, assetAddress, assetContractName, assetName } =
  //             values;

  //           void openContractCall({
  //             contractAddress: contractId.split('.')[0],
  //             contractName: contractId.split('.')[1],
  //             functionName: encodeURIComponent(fn.name),
  //             functionArgs: Object.values(final),
  //             network,
  //             authOrigin: CONNECT_AUTH_ORIGIN,
  //             postConditions:
  //               showPostCondition && postCondition
  //                 ? getPostCondition(postCondition, {
  //                     address,
  //                     conditionCode,
  //                     amount,
  //                     assetAddress,
  //                     assetContractName,
  //                     assetName,
  //                   })
  //                 : undefined,
  //             postConditionMode: isPostConditionModeEnabled,
  //           });
  //         } else {
  //           setReadonlyValue(Object.values(final));
  //         }
  //       }}
  //       render={({ handleSubmit, handleChange, values, errors, setFieldValue }) => {
  //         return (
  //           <Section
  //             overflowY="visible"
  //             flexGrow={1}
  //             title={`${fn.name} (${fn.access} function)`}
  //             borderRadius={'0'}
  //           >
  //             {readOnlyValue ? (
  //               <ReadOnlyField
  //                 fn={fn}
  //                 readOnlyValue={readOnlyValue}
  //                 contractId={contractId}
  //                 cancelButton={cancelButton}
  //               />
  //             ) : (
  //               <Box p="extra-loose" as="form" onSubmit={handleSubmit}>
  //                 <Flex marginBottom="16px" justifyContent="flex-end">
  //                   <Toggle
  //                     onClick={() =>
  //                       setPostConditionMode(
  //                         isPostConditionModeEnabled === PostConditionMode.Deny
  //                           ? PostConditionMode.Allow
  //                           : PostConditionMode.Deny
  //                       )
  //                     }
  //                     label={
  //                       isPostConditionModeEnabled === PostConditionMode.Deny
  //                         ? 'Deny Mode'
  //                         : 'Allow Mode'
  //                     }
  //                     value={isPostConditionModeEnabled === PostConditionMode.Allow ? true : false}
  //                   />
  //                   <Tooltip
  //                     label={
  //                       <Box>
  //                         Allow mode is less secure than Deny mode. Allow mode permits asset transfers
  //                         that are not covered by post conditions. In Deny mode no other asset
  //                         transfers are permitted besides those named in the post conditions
  //                       </Box>
  //                     }
  //                   >
  //                     <Flex alignItems="center" marginLeft="8px">
  //                       <InfoCircleIcon size="18px" />
  //                     </Flex>
  //                   </Tooltip>
  //                 </Flex>
  //                 {fn.args.length ? (
  //                   <Stack mb="extra-loose" spacing="base">
  //                     {fn.args.map(({ name, type }) => (
  //                       <Argument
  //                         handleChange={handleChange}
  //                         name={name}
  //                         type={type}
  //                         error={errors[name]}
  //                         key={name}
  //                         value={values[name]}
  //                       />
  //                     ))}
  //                     {fn.access === 'public' && (
  //                       <PostConditionButton
  //                         type="button"
  //                         disabled={isPostConditionModeEnabled === PostConditionMode.Allow}
  //                         showPostCondition={showPostCondition}
  //                         onClick={() => {
  //                           setShowPostCondition(!showPostCondition);
  //                         }}
  //                       >
  //                         {!showPostCondition
  //                           ? 'Add post condition (optional)'
  //                           : 'Remove post condition'}
  //                       </PostConditionButton>
  //                     )}
  //                     {showPostCondition && (
  //                       <Box>
  //                         <Box maxWidth="260px" maxHeight="42px" height="42px" marginBottom="16px">
  //                           <Dropdown
  //                             defaultOption={{ label: 'Select a post condition', value: undefined }}
  //                             options={PostConditionOptions}
  //                             onChange={option => {
  //                               if (option.value === PostConditionType.Stx) {
  //                                 setPostCondition(PostConditionType.Stx);
  //                               } else if (option.value === PostConditionType.Fungible) {
  //                                 setPostCondition(PostConditionType.Fungible);
  //                               } else if (option.value === PostConditionType.NonFungible) {
  //                                 setPostCondition(PostConditionType.NonFungible);
  //                               }
  //                             }}
  //                           />
  //                         </Box>

  //                         {postCondition && (
  //                           <Stack>
  //                             {postConditionParameterMap[postCondition].map(parameter =>
  //                               parameter !== 'conditionCode' ? (
  //                                 <Box key={parameter}>
  //                                   <Text
  //                                     fontSize="12px"
  //                                     fontWeight="500"
  //                                     display="block"
  //                                     color={color('text-caption')}
  //                                     htmlFor={parameter}
  //                                     mb="tight"
  //                                   >
  //                                     {postConditionParameterLabels[parameter]}
  //                                   </Text>
  //                                   <Box width="100%">
  //                                     <Input
  //                                       width="100%"
  //                                       type={parameter === 'amount' ? 'number' : 'text'}
  //                                       name={parameter}
  //                                       id={parameter}
  //                                       onChange={handleChange}
  //                                       value={values[parameter]}
  //                                     />
  //                                     {errors && (
  //                                       <Caption color={color('feedback-error')}>
  //                                         {errors[parameter]}
  //                                       </Caption>
  //                                     )}
  //                                   </Box>
  //                                 </Box>
  //                               ) : (
  //                                 <Box
  //                                   maxWidth="260px"
  //                                   maxHeight="42px"
  //                                   height="42px"
  //                                   marginBottom="16px"
  //                                   key={parameter}
  //                                 >
  //                                   <Dropdown
  //                                     defaultOption={{
  //                                       label: `Select a condition code`,
  //                                       value: undefined,
  //                                     }}
  //                                     options={
  //                                       postCondition === PostConditionType.NonFungible
  //                                         ? [
  //                                             {
  //                                               label: 'Does not send',
  //                                               value: NonFungibleConditionCode.DoesNotSend,
  //                                             },
  //                                             {
  //                                               label: 'Sends',
  //                                               value: NonFungibleConditionCode.Sends,
  //                                             },
  //                                           ]
  //                                         : [
  //                                             { label: 'Equal', value: FungibleConditionCode.Equal },
  //                                             {
  //                                               label: 'Greater',
  //                                               value: FungibleConditionCode.Greater,
  //                                             },
  //                                             {
  //                                               label: 'GreaterEqual',
  //                                               value: FungibleConditionCode.GreaterEqual,
  //                                             },
  //                                             { label: 'Less', value: FungibleConditionCode.Less },
  //                                             {
  //                                               label: 'LessEqual',
  //                                               value: FungibleConditionCode.LessEqual,
  //                                             },
  //                                           ]
  //                                     }
  //                                     onChange={option =>
  //                                       setFieldValue('conditionCode', option.value)
  //                                     }
  //                                   />
  //                                 </Box>
  //                               )
  //                             )}
  //                           </Stack>
  //                         )}
  //                       </Box>
  //                     )}
  //                   </Stack>
  //                 ) : null}
  //                 <Flex flexDirection="column" alignItems="center" justifyContent="center">
  //                   <Button type="submit">Call function</Button>
  //                   {cancelButton}
  //                 </Flex>
  //               </Box>
  //             )}
  //           </Section>
  //         );
  //       }}
  //     />
  //   );
};

const PostConditionButton = styled(Button)<{ disabled: boolean; showPostCondition: boolean }>`
  background-color: ${props =>
    props.disabled === true ? '#747478' : props.showPostConditon ? 'red' : null};
  opacity: ${props => (props.disabled === true ? '0.2' : null)};

  :hover {
    background-color: ${props => (props.disabled === true ? '#747478' : null)};
  }
`;
