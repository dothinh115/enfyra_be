import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Category } from './category.entity';

import { Role } from './role.entity';

import { Route } from './route.entity';

import { User } from './user.entity';

@Entity("setting")
export class Setting {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'boolean', nullable: false})
  isInit: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}